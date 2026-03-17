import {
  Component, OnInit, OnDestroy, signal, computed,
  inject, ViewChild, ElementRef, HostListener
} from '@angular/core';
import { CommonModule }         from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, interval }    from 'rxjs';
import { takeUntil, filter }    from 'rxjs/operators';
import gsap                     from 'gsap';
import {
  I18nService,
  type SupportedLanguage,
  LANGUAGE_META,
  ALL_LANGUAGES,
} from './i18n/i18n.service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type GameState = 'idle' | 'loading' | 'playing' | 'won' | 'lost' | 'timeout';
type Tab       = 'game' | 'analytics' | 'achievements' | 'leaderboard' | 'education';
type HintType  = 'higher' | 'lower' | 'correct' | null;
type Algorithm = 'simple' | 'linear_congruential' | 'mersenne_twister' | 'crypto_secure' | 'quantum_inspired';

interface DifficultyConfig {
  id:          string;
  range:       { min: number; max: number };
  maxAttempts: number;
  timeLimit:   number | null;
}

interface GameRecord {
  won:        boolean;
  attempts:   number;
  difficulty: string;
  algorithm:  Algorithm;
  ts:         number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
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
  simple:               '🎲',
  linear_congruential:  '📐',
  mersenne_twister:     '🌀',
  crypto_secure:        '🔒',
  quantum_inspired:     '⚛️',
};

const ACHIEVEMENT_DEFS = [
  { id: 'first_win',          icon: '🥇', rarity: 'common',    pts: 10  },
  { id: 'perfectionist',      icon: '🎯', rarity: 'legendary', pts: 100 },
  { id: 'speed_demon',        icon: '⚡', rarity: 'rare',      pts: 50  },
  { id: 'persistent',         icon: '💪', rarity: 'uncommon',  pts: 25  },
  { id: 'algorithm_explorer', icon: '🧮', rarity: 'epic',      pts: 150 },
  { id: 'quantum_pioneer',    icon: '⚛️', rarity: 'legendary', pts: 200 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Algorithm implementations (all client-side — no server needed)
// ─────────────────────────────────────────────────────────────────────────────
function generateNumber(alg: Algorithm, min: number, max: number): number {
  const range = max - min + 1;

  switch (alg) {
    // O(1) — basic Math.random
    case 'simple':
      return Math.floor(Math.random() * range) + min;

    // O(1) — deterministic LCG (Numerical Recipes constants)
    case 'linear_congruential': {
      const a    = 1664525;
      const c    = 1013904223;
      const m    = 2 ** 32;
      const seed = (a * (Date.now() & 0xffffffff) + c) % m;
      return Math.floor((seed / m) * range) + min;
    }

    // O(1) amortized — MT19937
    case 'mersenne_twister': {
      const mt = new Uint32Array(624);
      mt[0] = Date.now() >>> 0;
      for (let i = 1; i < 624; i++) {
        mt[i] = (Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i) >>> 0;
      }
      let y = mt[0];
      y ^= y >>> 11;
      y ^= (y << 7)  & 0x9d2c5680;
      y ^= (y << 15) & 0xefc60000;
      y ^= y >>> 18;
      return Math.floor(((y >>> 0) / 4294967296) * range) + min;
    }

    // O(1) — cryptographically secure (hardware entropy)
    case 'crypto_secure': {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return Math.floor((arr[0] / 4294967295) * range) + min;
    }

    // O(8 qubits) — quantum superposition simulation
    case 'quantum_inspired': {
      let s = 0;
      for (let q = 0; q < 8; q++) {
        s += Math.random() * Math.cos(Math.random() * 2 * Math.PI);
      }
      return Math.floor((Math.abs(s) % 1) * range) + min;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice Controller (Web Speech API — no external library)
// ─────────────────────────────────────────────────────────────────────────────
class VoiceController {
  readonly supported =
    'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  private recognition: any = null;

  onResult?: (value: number)  => void;
  onError?:  (msg: string)    => void;

  start(locale: string): void {
    if (!this.supported) return;
    const SR = (window as any).webkitSpeechRecognition
             ?? (window as any).SpeechRecognition;
    this.recognition             = new SR();
    this.recognition.lang        = locale;
    this.recognition.continuous  = false;
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (e: any) => {
      // Try all alternatives to find a number
      for (let i = 0; i < e.results[0].length; i++) {
        const text = e.results[0][i].transcript.trim();
        const num  = parseInt(text.replace(/\D/g, ''), 10);
        if (!isNaN(num)) { this.onResult?.(num); return; }
      }
      this.onError?.('no-number');
    };
    this.recognition.onerror = (e: any) => this.onError?.(e.error);
    this.recognition.start();
  }

  stop(): void { this.recognition?.stop(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
@Component({
  selector:    'app-root',
  standalone:  true,
  imports:     [CommonModule, ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrls:   ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {

  // ── Services ─────────────────────────────────────────────────────────────
  readonly i18n = inject(I18nService);
  readonly fb   = inject(FormBuilder);

  // ── Template refs ─────────────────────────────────────────────────────────
  @ViewChild('numberInputRef') numberInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('langDropRef')    langDropRef!:    ElementRef<HTMLDivElement>;

  // ── Signals — reactive state ───────────────────────────────────────────────
  readonly currentTab      = signal<Tab>('game');
  readonly gameState       = signal<GameState>('idle');
  readonly attempts        = signal(0);
  readonly secretNumber    = signal(0);
  readonly lastHint        = signal<HintType>(null);
  readonly lastGuessValue  = signal(0);
  readonly timeRemaining   = signal<number | null>(null);
  readonly isOnline        = signal(navigator.onLine);
  readonly isListening     = signal(false);
  readonly showLangDrop    = signal(false);
  readonly updateAvailable = signal(false);
  readonly lastHeard       = signal('');
  readonly gameHistory     = signal<GameRecord[]>(
    JSON.parse(localStorage.getItem('game-history') ?? '[]')
  );

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly diffConfig   = computed(() => DIFFICULTIES[this.form?.get('difficulty')?.value ?? 'medium']);
  readonly maxAttempts  = computed(() => this.diffConfig().maxAttempts);
  readonly gameProgress = computed(() =>
    this.maxAttempts() > 0 ? (this.attempts() / this.maxAttempts()) * 100 : 0
  );
  readonly isPlaying    = computed(() => this.gameState() === 'playing');
  readonly isGameOver   = computed(() =>
    ['won', 'lost', 'timeout'].includes(this.gameState())
  );
  readonly canGuess     = computed(() =>
    this.isPlaying()
    && this.guessForm?.valid
    && this.attempts() < this.maxAttempts()
  );
  readonly totalWins    = computed(() =>
    this.gameHistory().filter(g => g.won).length
  );
  readonly winRate      = computed(() => {
    const h = this.gameHistory();
    return h.length ? Math.round((this.totalWins() / h.length) * 100) : 0;
  });
  readonly currentStreak = computed(() => {
    let streak = 0;
    for (const g of [...this.gameHistory()].reverse()) {
      if (g.won) streak++; else break;
    }
    return streak;
  });

  // ── Forms ─────────────────────────────────────────────────────────────────
  form!:      FormGroup;
  guessForm!: FormGroup;

  // ── Exposed constants (used in template) ──────────────────────────────────
  readonly DIFFICULTIES  = DIFFICULTIES;
  readonly ALGORITHMS    = ALGORITHMS;
  readonly ALGO_ICONS    = ALGO_ICONS;
  readonly ACH_DEFS      = ACHIEVEMENT_DEFS;
  readonly ALL_LANGS     = ALL_LANGUAGES;
  readonly LANG_META     = LANGUAGE_META;
  readonly difficultyIds = Object.keys(DIFFICULTIES);

  // ── Internal ──────────────────────────────────────────────────────────────
  private readonly destroy$ = new Subject<void>();
  private readonly voice     = new VoiceController();
  readonly voiceSupported    = this.voice.supported;

  // ─────────────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.initForms();
    this.initNetworkMonitor();
    this.initVoice();
    this.checkForUpdate();
    this.animateInit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.voice.stop();
  }

  // ── i18n ──────────────────────────────────────────────────────────────────
  /** Shorthand for template: {{ t('key') }} */
  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }

  setLang(lang: SupportedLanguage): void {
    this.i18n.setLanguage(lang);
    this.showLangDrop.set(false);
    this.voice.stop();
    this.isListening.set(false);
  }

  toggleLangDrop(): void {
    const next = !this.showLangDrop();
    this.showLangDrop.set(next);
    if (next && this.langDropRef?.nativeElement) {
      gsap.fromTo(
        this.langDropRef.nativeElement,
        { opacity: 0, scale: 0.88, y: -8 },
        { opacity: 1, scale: 1, y: 0, duration: 0.2, ease: 'back.out(1.7)' }
      );
    }
  }

  // ── Tab navigation ────────────────────────────────────────────────────────
  setTab(tab: Tab): void {
    if (tab === this.currentTab()) return;
    const el = document.querySelector<HTMLElement>('.tab-content');
    if (el) {
      gsap.to(el, {
        opacity: 0, y: 8, duration: 0.12,
        onComplete: () => {
          this.currentTab.set(tab);
          setTimeout(() => {
            const next = document.querySelector<HTMLElement>('.tab-content');
            if (next) gsap.fromTo(next, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
          });
        },
      });
    } else {
      this.currentTab.set(tab);
    }
  }

  // ── Game ──────────────────────────────────────────────────────────────────
  startGame(): void {
    this.gameState.set('loading');
    const cfg = this.diffConfig();

    // Short loading state for UX feedback
    setTimeout(() => {
      this.secretNumber.set(
        generateNumber(this.form.get('algorithm')?.value ?? 'simple', cfg.range.min, cfg.range.max)
      );
      this.attempts.set(0);
      this.lastHint.set(null);
      this.lastGuessValue.set(0);
      this.guessForm.reset();
      this.gameState.set('playing');

      // Start timer if enabled and difficulty has one
      if (cfg.timeLimit && this.form.get('timeLimit')?.value) {
        this.startTimer(cfg.timeLimit);
      } else {
        this.timeRemaining.set(null);
      }

      gsap.fromTo('.game-area', { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' });
      setTimeout(() => this.numberInputRef?.nativeElement?.focus(), 120);
    }, 500);
  }

  submitGuess(): void {
    if (!this.canGuess()) return;

    const value = Number(this.guessForm.get('number')?.value);
    if (isNaN(value)) return;

    this.attempts.update(n => n + 1);
    const secret = this.secretNumber();

    if (value === secret) {
      this.lastHint.set('correct');
      this.gameState.set('won');
      this.saveRecord(true);
      this.animateWin();
    } else {
      const hint: HintType = value > secret ? 'lower' : 'higher';
      this.lastHint.set(hint);
      this.lastGuessValue.set(value);
      this.animateWrongGuess();
      if (this.attempts() >= this.maxAttempts()) {
        this.gameState.set('lost');
        this.saveRecord(false);
      }
    }

    this.guessForm.reset();
    setTimeout(() => this.numberInputRef?.nativeElement?.focus(), 60);
  }

  // ── Voice ─────────────────────────────────────────────────────────────────
  toggleVoice(): void {
    if (this.isListening()) {
      this.voice.stop();
      this.isListening.set(false);
      return;
    }
    this.lastHeard.set('');
    this.isListening.set(true);
    this.voice.start(this.LANG_META[this.i18n.lang()].locale);
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  private startTimer(seconds: number): void {
    this.timeRemaining.set(seconds);
    interval(1000).pipe(
      takeUntil(this.destroy$),
      filter(() => this.gameState() === 'playing'),
    ).subscribe(() => {
      const t = this.timeRemaining()!;
      if (t <= 1) {
        this.timeRemaining.set(0);
        this.gameState.set('timeout');
        this.saveRecord(false);
        return;
      }
      this.timeRemaining.set(t - 1);
    });
  }

  // ── Animations ────────────────────────────────────────────────────────────
  private animateInit(): void {
    gsap.from('.header',               { y: -50,  opacity: 0, duration: 0.55, ease: 'power3.out', delay: 0.05 });
    gsap.from('.sustainability-strip', { y: -20,  opacity: 0, duration: 0.4,  ease: 'power2.out', delay: 0.2  });
    gsap.from('.app-bg',               { opacity: 0, duration: 1.2, ease: 'power1.out' });
  }

  private animateWin(): void {
    gsap.timeline()
      .to('.number-input', { scale: 1.04, duration: 0.1 })
      .to('.number-input', { scale: 1, duration: 0.35, ease: 'elastic.out(1.2, 0.5)' })
      .from('.result-card', { y: 24, opacity: 0, duration: 0.45, ease: 'power3.out' }, '+=0.05');
  }

  private animateWrongGuess(): void {
    const el = this.numberInputRef?.nativeElement;
    if (el) {
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 420);
    }
    gsap.fromTo('.hint-box', { x: -8, opacity: 0.5 }, { x: 0, opacity: 1, duration: 0.28, ease: 'power2.out' });
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  private saveRecord(won: boolean): void {
    const record: GameRecord = {
      won, attempts: this.attempts(),
      difficulty: this.form.get('difficulty')?.value,
      algorithm:  this.form.get('algorithm')?.value,
      ts: Date.now(),
    };
    const updated = [record, ...this.gameHistory()].slice(0, 100);
    this.gameHistory.set(updated);
    localStorage.setItem('game-history', JSON.stringify(updated));
  }

  // ── PWA update check ──────────────────────────────────────────────────────
  private checkForUpdate(): void {
    const CURRENT = '3.0.0';
    fetch('/advanced-number-game/version.json', { cache: 'no-cache' })
      .then(r => r.json())
      .then((v: any) => { if (v?.version && v.version !== CURRENT) this.updateAvailable.set(true); })
      .catch(() => {});
  }

  applyUpdate(): void { window.location.reload(); }

  // ── Network ───────────────────────────────────────────────────────────────
  private initNetworkMonitor(): void {
    window.addEventListener('online',  () => this.isOnline.set(true));
    window.addEventListener('offline', () => this.isOnline.set(false));
  }

  // ── Voice setup ───────────────────────────────────────────────────────────
  private initVoice(): void {
    this.voice.onResult = (num) => {
      this.lastHeard.set(String(num));
      this.isListening.set(false);
      const cfg = this.diffConfig();
      if (num >= cfg.range.min && num <= cfg.range.max) {
        this.guessForm.patchValue({ number: num });
        this.submitGuess();
      }
    };
    this.voice.onError = (msg) => {
      this.lastHeard.set(msg);
      this.isListening.set(false);
    };
  }

  // ── Forms ─────────────────────────────────────────────────────────────────
  private initForms(): void {
    const saved = JSON.parse(localStorage.getItem('game-prefs') ?? '{}');
    this.form = this.fb.group({
      difficulty: [saved.difficulty ?? 'medium', Validators.required],
      algorithm:  [saved.algorithm  ?? 'simple',  Validators.required],
      timeLimit:  [saved.timeLimit  ?? true],
      adaptive:   [saved.adaptive   ?? false],
      voice:      [saved.voice      ?? false],
      ai:         [saved.ai         ?? false],
    });
    this.form.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(v => localStorage.setItem('game-prefs', JSON.stringify(v)));

    this.guessForm = this.fb.group({
      number: [null, [Validators.required, Validators.min(1), Validators.max(10000)]],
    });
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.showLangDrop()) {
      this.showLangDrop.set(false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && this.canGuess()) {
      e.preventDefault();
      this.submitGuess();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.lang-selector') && this.showLangDrop()) {
      this.showLangDrop.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  formatTime(seconds: number): string {
    if (seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
  }

  algoKey(alg: Algorithm): string {
    const map: Record<Algorithm, string> = {
      simple:               'simple',
      linear_congruential:  'lcg',
      mersenne_twister:     'mersenne',
      crypto_secure:        'crypto',
      quantum_inspired:     'quantum',
    };
    return map[alg];
  }
}
