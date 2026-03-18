import {
  Component, OnInit, OnDestroy, signal, computed,
  inject, ViewChild, ElementRef, HostListener
} from '@angular/core';
import { CommonModule }     from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, interval } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import gsap                  from 'gsap';
import {
  I18nService, type SupportedLanguage,
  LANGUAGE_META, ALL_LANGUAGES,
} from './i18n/i18n.service';

// ── Types ─────────────────────────────────────────────────────────────────────
type GameState = 'idle' | 'loading' | 'playing' | 'won' | 'lost' | 'timeout';
type Tab       = 'game' | 'analytics' | 'achievements' | 'leaderboard' | 'education';
type HintType  = 'higher' | 'lower' | 'correct' | null;
type Algorithm = 'simple' | 'linear_congruential' | 'mersenne_twister' | 'crypto_secure' | 'quantum_inspired';
type HeatLevel = 'frozen' | 'cold' | 'warm' | 'hot' | 'burning' | null;

interface DifficultyConfig {
  id: string; range: { min: number; max: number }; maxAttempts: number; timeLimit: number | null;
}
interface GameRecord {
  won: boolean; attempts: number; difficulty: string;
  algorithm: Algorithm; score: number; ts: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DIFFICULTIES: Record<string, DifficultyConfig> = {
  beginner:  { id: 'beginner',  range: { min: 1, max: 10   }, maxAttempts: 5,  timeLimit: null },
  easy:      { id: 'easy',      range: { min: 1, max: 25   }, maxAttempts: 6,  timeLimit: null },
  medium:    { id: 'medium',    range: { min: 1, max: 50   }, maxAttempts: 8,  timeLimit: 60   },
  hard:      { id: 'hard',      range: { min: 1, max: 100  }, maxAttempts: 10, timeLimit: 45   },
  expert:    { id: 'expert',    range: { min: 1, max: 500  }, maxAttempts: 12, timeLimit: 30   },
  nightmare: { id: 'nightmare', range: { min: 1, max: 1000 }, maxAttempts: 15, timeLimit: 20   },
};

const ALGORITHMS: Algorithm[] = [
  'simple', 'linear_congruential', 'mersenne_twister', 'crypto_secure', 'quantum_inspired',
];

const ALGO_ICONS: Record<Algorithm, string> = {
  simple: '🎲', linear_congruential: '📐',
  mersenne_twister: '🌀', crypto_secure: '🔒', quantum_inspired: '⚛️',
};

const ALGO_KEY_MAP: Record<Algorithm, string> = {
  simple: 'simple', linear_congruential: 'lcg',
  mersenne_twister: 'mersenne', crypto_secure: 'crypto', quantum_inspired: 'quantum',
};

// ── Algorithm implementations ─────────────────────────────────────────────────
function generateNumber(alg: Algorithm, min: number, max: number): number {
  const range = max - min + 1;
  switch (alg) {
    case 'simple': return Math.floor(Math.random() * range) + min;
    case 'linear_congruential': {
      const seed = (1664525 * (Date.now() & 0xffffffff) + 1013904223) % (2 ** 32);
      return Math.floor((seed / (2 ** 32)) * range) + min;
    }
    case 'mersenne_twister': {
      const mt = new Uint32Array(624);
      mt[0] = Date.now() >>> 0;
      for (let i = 1; i < 624; i++) mt[i] = (Math.imul(1812433253, mt[i-1] ^ (mt[i-1] >>> 30)) + i) >>> 0;
      let y = mt[0]; y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
      return Math.floor(((y >>> 0) / 4294967296) * range) + min;
    }
    case 'crypto_secure': {
      const arr = new Uint32Array(1); crypto.getRandomValues(arr);
      return Math.floor((arr[0] / 4294967295) * range) + min;
    }
    case 'quantum_inspired': {
      let s = 0;
      for (let q = 0; q < 8; q++) s += Math.random() * Math.cos(Math.random() * 2 * Math.PI);
      return Math.floor((Math.abs(s) % 1) * range) + min;
    }
  }
}

// ── Web Audio — sound effects ─────────────────────────────────────────────────
class SoundFX {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  play(type: 'correct' | 'wrong' | 'closer' | 'farther' | 'tick' | 'start'): void {
    try {
      const ctx  = this.getCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);

      const now = ctx.currentTime;

      switch (type) {
        case 'correct':
          osc.frequency.setValueAtTime(523, now);
          osc.frequency.setValueAtTime(659, now + .1);
          osc.frequency.setValueAtTime(784, now + .2);
          osc.frequency.setValueAtTime(1047, now + .3);
          gain.gain.setValueAtTime(.3, now);
          gain.gain.exponentialRampToValueAtTime(.001, now + .6);
          osc.start(now); osc.stop(now + .6);
          break;
        case 'wrong':
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.setValueAtTime(180, now + .1);
          gain.gain.setValueAtTime(.2, now);
          gain.gain.exponentialRampToValueAtTime(.001, now + .25);
          osc.start(now); osc.stop(now + .25);
          break;
        case 'closer':
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.setValueAtTime(550, now + .08);
          gain.gain.setValueAtTime(.15, now);
          gain.gain.exponentialRampToValueAtTime(.001, now + .2);
          osc.start(now); osc.stop(now + .2);
          break;
        case 'farther':
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.setValueAtTime(250, now + .08);
          gain.gain.setValueAtTime(.1, now);
          gain.gain.exponentialRampToValueAtTime(.001, now + .2);
          osc.start(now); osc.stop(now + .2);
          break;
        case 'start':
          osc.frequency.setValueAtTime(330, now);
          osc.frequency.setValueAtTime(440, now + .1);
          gain.gain.setValueAtTime(.2, now);
          gain.gain.exponentialRampToValueAtTime(.001, now + .25);
          osc.start(now); osc.stop(now + .25);
          break;
        case 'tick':
          osc.frequency.setValueAtTime(800, now);
          gain.gain.setValueAtTime(.05, now);
          gain.gain.exponentialRampToValueAtTime(.001, now + .05);
          osc.start(now); osc.stop(now + .05);
          break;
      }
    } catch (_) { /* AudioContext blocked — silently fail */ }
  }
}

// ── Voice Controller ──────────────────────────────────────────────────────────
class VoiceController {
  readonly supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  private recognition: any = null;
  onResult?: (value: number) => void;
  onError?:  (msg: string)  => void;

  start(locale: string): void {
    if (!this.supported) return;
    const SR = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition;
    this.recognition = new SR();
    this.recognition.lang = locale; this.recognition.continuous = false;
    this.recognition.onresult = (e: any) => {
      for (let i = 0; i < e.results[0].length; i++) {
        const num = parseInt(e.results[0][i].transcript.trim().replace(/\D/g, ''), 10);
        if (!isNaN(num)) { this.onResult?.(num); return; }
      }
      this.onError?.('no-number');
    };
    this.recognition.onerror = (e: any) => this.onError?.(e.error);
    this.recognition.start();
  }
  stop(): void { this.recognition?.stop(); }
}

// ── Component ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {

  readonly i18n = inject(I18nService);
  readonly fb   = inject(FormBuilder);

  @ViewChild('numberInputRef') numberInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('langDropRef')    langDropRef!:    ElementRef<HTMLDivElement>;

  // ── Signals ───────────────────────────────────────────────────────────────
  readonly currentTab      = signal<Tab>('game');
  readonly gameState       = signal<GameState>('idle');
  readonly attempts        = signal(0);
  readonly secretNumber    = signal(0);
  readonly lastHint        = signal<HintType>(null);
  readonly lastGuessValue  = signal(0);
  readonly heatLevel       = signal<HeatLevel>(null);
  readonly timeRemaining   = signal<number | null>(null);
  readonly elapsedSeconds  = signal(0);
  readonly score           = signal(0);
  readonly showConfetti    = signal(false);
  readonly isOnline        = signal(navigator.onLine);
  readonly isListening     = signal(false);
  readonly showLangDrop    = signal(false);
  readonly updateAvailable = signal(false);
  readonly lastHeard       = signal('');
  readonly gameHistory     = signal<GameRecord[]>(
    JSON.parse(localStorage.getItem('game-history') ?? '[]')
  );

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly diffConfig    = computed(() => DIFFICULTIES[this.form?.get('difficulty')?.value ?? 'medium']);
  readonly maxAttempts   = computed(() => this.diffConfig().maxAttempts);
  readonly gameProgress  = computed(() => this.maxAttempts() > 0 ? (this.attempts() / this.maxAttempts()) * 100 : 0);
  readonly livesLeft     = computed(() => Math.max(0, this.maxAttempts() - this.attempts()));
  readonly isPlaying     = computed(() => this.gameState() === 'playing');
  readonly isGameOver    = computed(() => ['won', 'lost', 'timeout'].includes(this.gameState()));
  readonly canGuess      = computed(() => this.isPlaying() && this.guessForm?.valid && this.attempts() < this.maxAttempts());
  readonly totalWins     = computed(() => this.gameHistory().filter(g => g.won).length);
  readonly winRate       = computed(() => {
    const h = this.gameHistory();
    return h.length ? Math.round((this.totalWins() / h.length) * 100) : 0;
  });
  readonly currentStreak = computed(() => {
    let streak = 0;
    for (const g of [...this.gameHistory()].reverse()) { if (g.won) streak++; else break; }
    return streak;
  });
  readonly bestScore = computed(() =>
    this.gameHistory().reduce((best, g) => Math.max(best, g.score ?? 0), 0)
  );

  // ── Heat display ──────────────────────────────────────────────────────────
  readonly heatEmoji = computed(() => {
    switch (this.heatLevel()) {
      case 'burning': return '🌋';
      case 'hot':     return '🔥';
      case 'warm':    return '♨️';
      case 'cold':    return '🥶';
      case 'frozen':  return '❄️';
      default:        return '';
    }
  });

  readonly heatLabel = computed(() => {
    const lang = this.i18n.lang();
    const labels: Record<HeatLevel, Record<string, string>> = {
      burning: { es:'¡Ardiendo!', en:'Burning!', fr:'Brûlant!', pt:'Queimando!', ru:'Горит!', tr:'Yanıyor!', ar:'محترق!', he:'בוער!', ko:'타오르는!', ja:'燃えてる!', zh:'燃烧中!' },
      hot:     { es:'¡Muy caliente!', en:'Very hot!', fr:'Très chaud!', pt:'Muito quente!', ru:'Очень горячо!', tr:'Çok sıcak!', ar:'ساخن جداً!', he:'חם מאוד!', ko:'매우 뜨거워!', ja:'かなり熱い!', zh:'非常热!' },
      warm:    { es:'Tibio...', en:'Getting warm...', fr:'Tiède...', pt:'Morno...', ru:'Тепло...', tr:'Ilık...', ar:'دافئ...', he:'חמים...', ko:'따뜻해지고 있어...', ja:'温かくなってきた...', zh:'越来越暖...' },
      cold:    { es:'Frío...', en:'Cold...', fr:'Froid...', pt:'Frio...', ru:'Холодно...', tr:'Soğuk...', ar:'بارد...', he:'קר...', ko:'차가워...', ja:'冷たい...', zh:'冷...' },
      frozen:  { es:'¡Congelado! ❄️', en:'Frozen! ❄️', fr:'Gelé! ❄️', pt:'Congelado! ❄️', ru:'Заморожено! ❄️', tr:'Donmuş! ❄️', ar:'مجمد! ❄️', he:'קפוא! ❄️', ko:'얼어붙었어! ❄️', ja:'凍ってる! ❄️', zh:'冻住了! ❄️' },
      null:    {},
    };
    const map = labels[this.heatLevel() ?? 'null'];
    return map?.[lang] ?? map?.['en'] ?? '';
  });

  // ── Forms ─────────────────────────────────────────────────────────────────
  form!:      FormGroup;
  guessForm!: FormGroup;

  // ── Template constants ────────────────────────────────────────────────────
  readonly TABS: Tab[]             = ['game','analytics','achievements','leaderboard','education'];
  readonly TAB_ICONS: Record<Tab, string> = {
    game:'🎮', analytics:'📊', achievements:'🏆', leaderboard:'👑', education:'📚',
  };
  readonly DIFFICULTIES  = DIFFICULTIES;
  readonly ALGORITHMS    = ALGORITHMS;
  readonly ALGO_ICONS    = ALGO_ICONS;
  readonly LANG_META     = LANGUAGE_META;
  readonly ALL_LANGS     = ALL_LANGUAGES;
  readonly difficultyIds = Object.keys(DIFFICULTIES);
  readonly ACH_DEFS = [
    { id:'first_win',          icon:'🥇', rarity:'common',    pts:10  },
    { id:'perfectionist',      icon:'🎯', rarity:'legendary', pts:100 },
    { id:'speed_demon',        icon:'⚡', rarity:'rare',      pts:50  },
    { id:'persistent',         icon:'💪', rarity:'uncommon',  pts:25  },
    { id:'algorithm_explorer', icon:'🧮', rarity:'epic',      pts:150 },
    { id:'quantum_pioneer',    icon:'⚛️', rarity:'legendary', pts:200 },
  ];
  readonly CONFIG_OPTIONS = [
    { key:'timeLimit', icon:'⏱️' },
    { key:'adaptive',  icon:'🧠' },
    { key:'ai',        icon:'🤖' },
    { key:'voice',     icon:'🎙️' },
  ];
  readonly EDU_ALGORITHMS = [
    { alg:'simple'              as Algorithm, label:'Simple Random',       complexity:'O(1)',        color:'gold'   },
    { alg:'linear_congruential' as Algorithm, label:'Linear Congruential', complexity:'O(1)',        color:'teal'   },
    { alg:'mersenne_twister'    as Algorithm, label:'Mersenne Twister',    complexity:'O(1) amort.', color:'violet' },
    { alg:'crypto_secure'       as Algorithm, label:'Crypto-Secure',       complexity:'O(1)',        color:'rose'   },
    { alg:'quantum_inspired'    as Algorithm, label:'Quantum-Inspired',    complexity:'O(8 qubits)', color:'amber'  },
  ];

  // ── Internal ──────────────────────────────────────────────────────────────
  private readonly destroy$ = new Subject<void>();
  private readonly voice     = new VoiceController();
  private readonly sfx       = new SoundFX();
  private gameStartTime      = 0;
  readonly voiceSupported    = this.voice.supported;

  // ─────────────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.initForms();
    this.initNetworkMonitor();
    this.initVoice();
    this.checkForUpdate();
    gsap.from('.header',               { y:-50, opacity:0, duration:.55, ease:'power3.out', delay:.05 });
    gsap.from('.sustainability-strip', { y:-20, opacity:0, duration:.4,  ease:'power2.out', delay:.2  });
    gsap.from('.app-bg',               { opacity:0, duration:1.2, ease:'power1.out' });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); this.voice.stop(); }

  // ── i18n ──────────────────────────────────────────────────────────────────
  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  setLang(lang: SupportedLanguage): void {
    this.i18n.setLanguage(lang); this.showLangDrop.set(false);
    this.voice.stop(); this.isListening.set(false);
  }

  toggleLangDrop(): void {
    const next = !this.showLangDrop();
    this.showLangDrop.set(next);
    if (next && this.langDropRef?.nativeElement) {
      gsap.fromTo(this.langDropRef.nativeElement,
        { opacity:0, scale:.88, y:-8 },
        { opacity:1, scale:1, y:0, duration:.2, ease:'back.out(1.7)' }
      );
    }
  }

  // ── Tab ───────────────────────────────────────────────────────────────────
  setTab(tab: Tab): void {
    if (tab === this.currentTab()) return;
    const el = document.querySelector<HTMLElement>('.tab-content');
    if (el) {
      gsap.to(el, { opacity:0, y:8, duration:.12, onComplete: () => {
        this.currentTab.set(tab);
        setTimeout(() => {
          const next = document.querySelector<HTMLElement>('.tab-content');
          if (next) gsap.fromTo(next, { opacity:0, y:14 }, { opacity:1, y:0, duration:.22, ease:'power2.out' });
        });
      }});
    } else { this.currentTab.set(tab); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GAME LOGIC
  // ══════════════════════════════════════════════════════════════════════════
  startGame(): void {
    this.gameState.set('loading');
    const cfg = this.diffConfig();
    this.sfx.play('start');

    setTimeout(() => {
      this.secretNumber.set(generateNumber(
        this.form.get('algorithm')?.value ?? 'simple', cfg.range.min, cfg.range.max
      ));
      this.attempts.set(0);
      this.score.set(0);
      this.lastHint.set(null);
      this.heatLevel.set(null);
      this.lastGuessValue.set(0);
      this.elapsedSeconds.set(0);
      this.showConfetti.set(false);
      this.guessForm.reset();
      this.gameStartTime = Date.now();
      this.gameState.set('playing');

      // Always start elapsed timer
      this.startElapsedTimer();

      // Countdown timer if applicable
      if (cfg.timeLimit && this.form.get('timeLimit')?.value) {
        this.startCountdownTimer(cfg.timeLimit);
      } else {
        this.timeRemaining.set(null);
      }

      gsap.fromTo('.game-area', { opacity:0, scale:.97 }, { opacity:1, scale:1, duration:.35, ease:'power2.out' });
      setTimeout(() => this.numberInputRef?.nativeElement?.focus(), 120);
    }, 500);
  }

  submitGuess(): void {
    if (!this.canGuess()) return;
    const value = Number(this.guessForm.get('number')?.value);
    if (isNaN(value)) return;

    this.attempts.update(n => n + 1);
    const secret = this.secretNumber();
    const range  = this.diffConfig().range.max - this.diffConfig().range.min;
    const diff   = Math.abs(value - secret);
    const pct    = diff / range;

    if (value === secret) {
      this.lastHint.set('correct');
      this.heatLevel.set('burning');
      const pts = this.calculateScore();
      this.score.set(pts);
      this.gameState.set('won');
      this.saveRecord(true, pts);
      this.sfx.play('correct');
      this.triggerConfetti();
      // Animate result card after Angular renders it
      setTimeout(() => this.animateWin(), 50);
    } else {
      const hint: HintType = value > secret ? 'lower' : 'higher';
      this.lastHint.set(hint);
      this.lastGuessValue.set(value);

      // Heat level
      let heat: HeatLevel;
      if (pct < 0.05)      heat = 'burning';
      else if (pct < 0.15) heat = 'hot';
      else if (pct < 0.35) heat = 'warm';
      else if (pct < 0.65) heat = 'cold';
      else                  heat = 'frozen';

      const prevHeat = this.heatLevel();
      this.heatLevel.set(heat);

      // Sound based on getting closer or farther
      const heatOrder = ['frozen','cold','warm','hot','burning'];
      const prevIdx = prevHeat ? heatOrder.indexOf(prevHeat) : -1;
      const currIdx = heatOrder.indexOf(heat);
      if (prevHeat && currIdx > prevIdx) this.sfx.play('closer');
      else this.sfx.play('wrong');

      this.animateWrongGuess();

      if (this.attempts() >= this.maxAttempts()) {
        this.gameState.set('lost');
        this.saveRecord(false, 0);
        setTimeout(() => this.animateLoss(), 50);
      }
    }

    this.guessForm.reset();
    setTimeout(() => this.numberInputRef?.nativeElement?.focus(), 60);
  }

  calculateScore(): number {
    const cfg         = this.diffConfig();
    const rangeSize   = cfg.range.max - cfg.range.min;
    const baseScore   = rangeSize * 10;
    const attPenalty  = (this.attempts() - 1) * (baseScore / cfg.maxAttempts);
    const timePenalty = cfg.timeLimit ? (this.elapsedSeconds() / cfg.timeLimit) * baseScore * 0.3 : 0;
    return Math.max(100, Math.round(baseScore - attPenalty - timePenalty));
  }

  abandonGame(): void {
    this.gameState.set('idle');
    this.heatLevel.set(null);
    this.showConfetti.set(false);
    this.timeRemaining.set(null);
    this.elapsedSeconds.set(0);
  }

  // ── Animations ────────────────────────────────────────────────────────────
  private animateWin(): void {
    const card = document.querySelector('.result-card');
    if (card) {
      gsap.fromTo(card, { opacity:0, y:30, scale:.95 }, { opacity:1, y:0, scale:1, duration:.5, ease:'back.out(1.4)' });
    }
  }

  private animateLoss(): void {
    const card = document.querySelector('.result-card');
    if (card) {
      gsap.fromTo(card, { opacity:0, y:20 }, { opacity:1, y:0, duration:.4, ease:'power2.out' });
    }
  }

  private animateWrongGuess(): void {
    const el = this.numberInputRef?.nativeElement;
    if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 420); }
    const hint = document.querySelector('.hint-box');
    if (hint) gsap.fromTo(hint, { x:-8, opacity:.5 }, { x:0, opacity:1, duration:.28, ease:'power2.out' });
  }

  // ── Confetti ──────────────────────────────────────────────────────────────
  private triggerConfetti(): void {
    this.showConfetti.set(true);
    setTimeout(() => this.showConfetti.set(false), 4000);
  }

  // ── Timers ────────────────────────────────────────────────────────────────
  private startElapsedTimer(): void {
    interval(1000).pipe(
      takeUntil(this.destroy$),
      filter(() => this.gameState() === 'playing')
    ).subscribe(() => this.elapsedSeconds.update(n => n + 1));
  }

  private startCountdownTimer(seconds: number): void {
    this.timeRemaining.set(seconds);
    interval(1000).pipe(
      takeUntil(this.destroy$),
      filter(() => this.gameState() === 'playing')
    ).subscribe(() => {
      const t = this.timeRemaining()!;
      if (t <= 1) {
        this.timeRemaining.set(0);
        this.gameState.set('timeout');
        this.saveRecord(false, 0);
        setTimeout(() => this.animateLoss(), 50);
        return;
      }
      this.timeRemaining.set(t - 1);
      if (t <= 10) this.sfx.play('tick');
    });
  }

  // ── Voice ─────────────────────────────────────────────────────────────────
  toggleVoice(): void {
    if (this.isListening()) { this.voice.stop(); this.isListening.set(false); return; }
    this.lastHeard.set(''); this.isListening.set(true);
    this.voice.start(this.LANG_META[this.i18n.lang()].locale);
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  private saveRecord(won: boolean, score: number): void {
    const record: GameRecord = {
      won, score, attempts: this.attempts(),
      difficulty: this.form.get('difficulty')?.value,
      algorithm:  this.form.get('algorithm')?.value,
      ts: Date.now(),
    };
    const updated = [record, ...this.gameHistory()].slice(0, 100);
    this.gameHistory.set(updated);
    localStorage.setItem('game-history', JSON.stringify(updated));
  }

  // ── Helpers used in template ──────────────────────────────────────────────
  getAlgoIcon(alg: string): string { return ALGO_ICONS[alg as Algorithm] ?? '🎲'; }
  algoKey(alg: string): string     { return ALGO_KEY_MAP[alg as Algorithm] ?? alg; }

  getLivesArray(): number[] {
    return Array.from({ length: this.maxAttempts() }, (_, i) => i);
  }

  getMetrics() {
    return [
      { icon:'🏆', label: this.t('stats.winRate'),    value: this.winRate() + '%',          color:'gold'   },
      { icon:'🎯', label: this.t('stats.totalGames'), value: this.gameHistory().length,      color:'teal'   },
      { icon:'🔥', label: this.t('stats.streak'),     value: this.currentStreak(),           color:'amber'  },
      { icon:'⭐', label: this.t('stats.wins'),       value: this.totalWins(),               color:'green'  },
    ];
  }

  getBinarySearchTip(): string {
    const lang = this.i18n.lang();
    const tips: Partial<Record<string, string>> = {
      es: 'La búsqueda binaria garantiza encontrar el número en ⌈log₂(N)⌉ intentos. Para rango 1–100: máximo 7 intentos. Para 1–1000: máximo 10.',
      en: 'Binary search guarantees finding the number in ⌈log₂(N)⌉ attempts. Range 1–100: max 7. Range 1–1000: max 10.',
      fr: 'La recherche binaire garantit de trouver le nombre en ⌈log₂(N)⌉ tentatives. Plage 1–100: max 7. Pour 1–1000: max 10.',
      pt: 'A busca binária garante encontrar o número em ⌈log₂(N)⌉ tentativas. Para 1–100: máximo 7. Para 1–1000: máximo 10.',
      ru: 'Двоичный поиск гарантирует нахождение числа за ⌈log₂(N)⌉ попыток. Для 1–100: максимум 7. Для 1–1000: максимум 10.',
    };
    return tips[lang] ?? tips['en']!;
  }

  formatTime(seconds: number): string {
    if (seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2,'0')}` : `${s}s`;
  }

  applyUpdate(): void { window.location.reload(); }

  // ── Network ───────────────────────────────────────────────────────────────
  private initNetworkMonitor(): void {
    window.addEventListener('online',  () => this.isOnline.set(true));
    window.addEventListener('offline', () => this.isOnline.set(false));
  }

  private initVoice(): void {
    this.voice.onResult = (num) => {
      this.lastHeard.set(String(num)); this.isListening.set(false);
      const cfg = this.diffConfig();
      if (num >= cfg.range.min && num <= cfg.range.max) {
        this.guessForm.patchValue({ number: num }); this.submitGuess();
      }
    };
    this.voice.onError = (msg) => { this.lastHeard.set(msg); this.isListening.set(false); };
  }

  private initForms(): void {
    const saved = JSON.parse(localStorage.getItem('game-prefs') ?? '{}');
    this.form = this.fb.group({
      difficulty: [saved.difficulty ?? 'medium'],
      algorithm:  [saved.algorithm  ?? 'simple'],
      timeLimit:  [saved.timeLimit  ?? true],
      adaptive:   [false], voice: [false], ai: [false],
    });
    this.form.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(v => localStorage.setItem('game-prefs', JSON.stringify(v)));
    this.guessForm = this.fb.group({
      number: [null, [Validators.required, Validators.min(1), Validators.max(10000)]],
    });
  }

  private checkForUpdate(): void {
    fetch('/advanced-number-game/version.json', { cache:'no-cache' })
      .then(r => r.json())
      .then((v: any) => { if (v?.version && v.version !== '3.0.0') this.updateAvailable.set(true); })
      .catch(() => {});
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.showLangDrop()) this.showLangDrop.set(false);
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && this.canGuess()) {
      e.preventDefault(); this.submitGuess();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.lang-selector') && this.showLangDrop()) {
      this.showLangDrop.set(false);
    }
  }
}
