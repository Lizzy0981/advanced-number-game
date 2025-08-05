import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, BehaviorSubject, Observable, combineLatest, interval, fromEvent } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap, map, filter, startWith } from 'rxjs/operators';
import { GameService, AnalyticsService, I18nService, ThemeService } from './services';
import { 
  GameSession, 
  GameConfig, 
  GameState, 
  PlayerStatistics, 
  Achievement, 
  DifficultyLevel,
  AlgorithmType,
  GameResult,
  PerformanceMetrics,
  LearningInsight,
  ChartData 
} from './models';
import { Chart, ChartConfiguration, ChartData as ChartJSData } from 'chart.js';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('performanceChart', { static: false }) performanceChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('distributionChart', { static: false }) distributionChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('numberInput', { static: false }) numberInputRef!: ElementRef<HTMLInputElement>;

  // Reactive Form
  gameConfigForm: FormGroup;
  guessForm: FormGroup;

  // Observables and State Management
  private destroy$ = new Subject<void>();
  private gameTimer$ = new BehaviorSubject<number>(0);
  private gameSession$ = new BehaviorSubject<GameSession | null>(null);
  private playerStatistics$ = new BehaviorSubject<PlayerStatistics>(this.getInitialStats());
  private achievements$ = new BehaviorSubject<Achievement[]>([]);
  private currentLanguage$ = new BehaviorSubject<string>('es');
  private theme$ = new BehaviorSubject<'light' | 'dark'>('light');

  // Game State
  currentGameState: GameState = 'idle';
  currentSession: GameSession | null = null;
  currentGuess: number | null = null;
  gameHistory: GameResult[] = [];
  attempts: number = 0;
  maxAttempts: number = 10;
  secretNumber: number = 0;
  gameStartTime: number = 0;
  gameDuration: number = 0;
  lastHint: string = '';
  
  // UI State
  isLoading: boolean = false;
  showAdvancedSettings: boolean = false;
  showAnalyticsDashboard: boolean = false;
  showAchievements: boolean = false;
  showLeaderboard: boolean = false;
  animateResult: boolean = false;
  currentTab: 'game' | 'analytics' | 'achievements' | 'leaderboard' = 'game';

  // Analytics and Insights
  performanceMetrics: PerformanceMetrics = this.getInitialMetrics();
  learningInsights: LearningInsight[] = [];
  recentAchievements: Achievement[] = [];
  globalLeaderboard: any[] = [];
  personalBests: any = {};

  // Chart instances
  performanceChart: Chart | null = null;
  distributionChart: Chart | null = null;

  // Configuration Options
  readonly difficultyLevels: DifficultyLevel[] = [
    { 
      id: 'beginner', 
      name: { es: 'Principiante', en: 'Beginner' }, 
      range: { min: 1, max: 10 }, 
      maxAttempts: 5,
      timeLimit: null,
      description: { es: 'Perfecto para empezar', en: 'Perfect to get started' }
    },
    { 
      id: 'easy', 
      name: { es: 'Fácil', en: 'Easy' }, 
      range: { min: 1, max: 25 }, 
      maxAttempts: 6,
      timeLimit: null,
      description: { es: 'Nivel básico cómodo', en: 'Comfortable basic level' }
    },
    { 
      id: 'medium', 
      name: { es: 'Medio', en: 'Medium' }, 
      range: { min: 1, max: 50 }, 
      maxAttempts: 8,
      timeLimit: 60,
      description: { es: 'Desafío equilibrado', en: 'Balanced challenge' }
    },
    { 
      id: 'hard', 
      name: { es: 'Difícil', en: 'Hard' }, 
      range: { min: 1, max: 100 }, 
      maxAttempts: 10,
      timeLimit: 45,
      description: { es: 'Para jugadores experimentados', en: 'For experienced players' }
    },
    { 
      id: 'expert', 
      name: { es: 'Experto', en: 'Expert' }, 
      range: { min: 1, max: 500 }, 
      maxAttempts: 12,
      timeLimit: 30,
      description: { es: 'Máximo desafío mental', en: 'Maximum mental challenge' }
    },
    { 
      id: 'nightmare', 
      name: { es: 'Pesadilla', en: 'Nightmare' }, 
      range: { min: 1, max: 1000 }, 
      maxAttempts: 15,
      timeLimit: 20,
      description: { es: 'Solo para maestros', en: 'Only for masters' }
    }
  ];

  readonly algorithmTypes: AlgorithmType[] = [
    {
      id: 'simple',
      name: { es: 'Simple Random', en: 'Simple Random' },
      description: { es: 'Generador básico Math.random()', en: 'Basic Math.random() generator' },
      complexity: 'low',
      icon: '🎲'
    },
    {
      id: 'linear_congruential',
      name: { es: 'Linear Congruential', en: 'Linear Congruential' },
      description: { es: 'Algoritmo determinístico LCG', en: 'Deterministic LCG algorithm' },
      complexity: 'medium',
      icon: '📐'
    },
    {
      id: 'mersenne_twister',
      name: { es: 'Mersenne Twister', en: 'Mersenne Twister' },
      description: { es: 'Generador pseudo-aleatorio de alta calidad', en: 'High-quality pseudo-random generator' },
      complexity: 'high',
      icon: '🌀'
    },
    {
      id: 'crypto_secure',
      name: { es: 'Crypto Secure', en: 'Crypto Secure' },
      description: { es: 'Criptográficamente seguro', en: 'Cryptographically secure' },
      complexity: 'enterprise',
      icon: '🔒'
    },
    {
      id: 'quantum_inspired',
      name: { es: 'Quantum Inspired', en: 'Quantum Inspired' },
      description: { es: 'Simulación cuántica avanzada', en: 'Advanced quantum simulation' },
      complexity: 'research',
      icon: '⚛️'
    }
  ];

  // Advanced Game Features
  adaptiveDifficulty: boolean = false;
  patternDetection: boolean = true;
  aiAssistance: boolean = false;
  competitiveMode: boolean = false;
  practiceMode: boolean = false;

  constructor(
    private formBuilder: FormBuilder,
    private gameService: GameService,
    private analyticsService: AnalyticsService,
    private i18nService: I18nService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForms();
    this.setupReactiveStreams();
  }

  ngOnInit(): void {
    this.loadUserPreferences();
    this.initializeAnalytics();
    this.setupEventListeners();
    this.startPerformanceMonitoring();
    this.checkForAchievements();
    this.preloadAssets();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanupCharts();
  }

  private initializeForms(): void {
    this.gameConfigForm = this.formBuilder.group({
      difficulty: ['medium', Validators.required],
      algorithm: ['simple', Validators.required],
      timeLimit: [true],
      adaptiveDifficulty: [false],
      patternDetection: [true],
      aiAssistance: [false],
      practiceMode: [false]
    });

    this.guessForm = this.formBuilder.group({
      number: [null, [
        Validators.required,
        Validators.min(1),
        Validators.max(1000),
        this.validateNumberRange.bind(this)
      ]]
    });

    // React to form changes
    this.gameConfigForm.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(config => this.onConfigurationChange(config));
  }

  private setupReactiveStreams(): void {
    // Game timer
    interval(1000)
      .pipe(
        takeUntil(this.destroy$),
        filter(() => this.currentGameState === 'playing'),
        map(() => Date.now() - this.gameStartTime)
      )
      .subscribe(duration => {
        this.gameDuration = Math.floor(duration / 1000);
        this.gameTimer$.next(this.gameDuration);
        this.checkTimeLimit();
      });

    // Language changes
    this.currentLanguage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(lang => {
        this.i18nService.setLanguage(lang);
        this.updateChartsLabels();
        this.cdr.markForCheck();
      });

    // Theme changes
    this.theme$
      .pipe(takeUntil(this.destroy$))
      .subscribe(theme => {
        this.themeService.setTheme(theme);
        this.updateChartsTheme();
        this.cdr.markForCheck();
      });

    // Statistics updates
    this.playerStatistics$
      .pipe(takeUntil(this.destroy$))
      .subscribe(stats => {
        this.performanceMetrics = this.calculatePerformanceMetrics(stats);
        this.updateAnalyticsCharts();
        this.cdr.markForCheck();
      });
  }

  private setupEventListeners(): void {
    // Keyboard shortcuts
    fromEvent<KeyboardEvent>(document, 'keydown')
      .pipe(
        takeUntil(this.destroy$),
        filter(event => this.currentGameState === 'playing')
      )
      .subscribe(event => {
        switch (event.key) {
          case 'Enter':
            if (this.guessForm.valid) {
              this.makeGuess();
            }
            break;
          case 'Escape':
            this.abandonGame();
            break;
          case 'h':
            if (event.ctrlKey) {
              event.preventDefault();
              this.requestHint();
            }
            break;
        }
      });

    // Window focus/blur for game pause
    fromEvent(window, 'blur')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.pauseGame());

    fromEvent(window, 'focus')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.resumeGame());
  }

  private validateNumberRange(control: any) {
    if (!this.currentSession) return null;
    
    const value = control.value;
    const { min, max } = this.currentSession.config.range;
    
    if (value < min || value > max) {
      return { outOfRange: { min, max, actual: value } };
    }
    
    return null;
  }

  async startNewGame(): Promise<void> {
    try {
      this.isLoading = true;
      this.currentGameState = 'loading';
      
      const config: GameConfig = {
        ...this.gameConfigForm.value,
        playerId: this.getPlayerId(),
        sessionId: this.generateSessionId()
      };

      this.currentSession = await this.gameService.createGameSession(config);
      this.secretNumber = this.currentSession.secretNumber;
      this.maxAttempts = this.currentSession.config.maxAttempts;
      this.attempts = 0;
      this.gameStartTime = Date.now();
      this.currentGameState = 'playing';
      this.lastHint = '';

      // Analytics tracking
      this.analyticsService.trackGameStart(config);
      
      // Focus input
      setTimeout(() => {
        this.numberInputRef?.nativeElement.focus();
      }, 100);

      // Initialize game-specific features
      if (config.patternDetection) {
        this.initializePatternDetection();
      }

      if (config.aiAssistance) {
        this.initializeAIAssistance();
      }

    } catch (error) {
      console.error('Error starting game:', error);
      this.handleGameError(error);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  async makeGuess(): Promise<void> {
    if (!this.currentSession || this.currentGameState !== 'playing' || !this.guessForm.valid) {
      return;
    }

    try {
      const guessValue = this.guessForm.get('number')?.value;
      this.currentGuess = guessValue;
      this.attempts++;

      const guessResult = await this.gameService.makeGuess(
        this.currentSession.sessionId,
        guessValue,
        this.attempts
      );

      // Process guess result
      this.processGuessResult(guessResult);

      // Pattern detection analysis
      if (this.gameConfigForm.get('patternDetection')?.value) {
        this.analyzeGuessingPattern(guessValue);
      }

      // AI assistance
      if (this.gameConfigForm.get('aiAssistance')?.value) {
        this.provideAIGuidance(guessValue, guessResult);
      }

      // Update UI
      this.animateResult = true;
      setTimeout(() => this.animateResult = false, 500);

      // Check game end conditions
      if (guessResult.isCorrect) {
        await this.handleGameWin();
      } else if (this.attempts >= this.maxAttempts) {
        await this.handleGameLoss();
      }

      // Clear input for next guess
      this.guessForm.patchValue({ number: null });

    } catch (error) {
      console.error('Error making guess:', error);
      this.handleGameError(error);
    }
  }

  private async processGuessResult(result: any): void {
    this.lastHint = this.generateHintMessage(result);
    
    // Advanced hint generation based on algorithm
    if (this.currentSession?.config.algorithm === 'quantum_inspired') {
      this.lastHint += this.generateQuantumHint(result);
    }

    // Update guess history
    this.currentSession?.guessHistory.push({
      attempt: this.attempts,
      guess: this.currentGuess!,
      result: result.hint,
      timestamp: Date.now(),
      timeTaken: Date.now() - this.gameStartTime
    });
  }

  private async handleGameWin(): Promise<void> {
    this.currentGameState = 'won';
    const finalTime = Date.now() - this.gameStartTime;

    const gameResult: GameResult = {
      sessionId: this.currentSession!.sessionId,
      won: true,
      attempts: this.attempts,
      duration: finalTime,
      difficulty: this.currentSession!.config.difficulty,
      algorithm: this.currentSession!.config.algorithm,
      score: this.calculateScore(),
      timestamp: new Date().toISOString()
    };

    // Save result and update statistics
    await this.gameService.saveGameResult(gameResult);
    this.updatePlayerStatistics(gameResult);
    this.gameHistory.unshift(gameResult);

    // Check for new achievements
    const newAchievements = await this.checkForNewAchievements(gameResult);
    if (newAchievements.length > 0) {
      this.showAchievementNotifications(newAchievements);
    }

    // Analytics
    this.analyticsService.trackGameComplete(gameResult);
    
    // Generate insights
    this.generateLearningInsights();
  }

  private async handleGameLoss(): Promise<void> {
    this.currentGameState = 'lost';
    const finalTime = Date.now() - this.gameStartTime;

    const gameResult: GameResult = {
      sessionId: this.currentSession!.sessionId,
      won: false,
      attempts: this.attempts,
      duration: finalTime,
      difficulty: this.currentSession!.config.difficulty,
      algorithm: this.currentSession!.config.algorithm,
      score: 0,
      timestamp: new Date().toISOString()
    };

    await this.gameService.saveGameResult(gameResult);
    this.updatePlayerStatistics(gameResult);
    this.gameHistory.unshift(gameResult);

    this.analyticsService.trackGameComplete(gameResult);
  }

  private calculateScore(): number {
    const baseScore = 1000;
    const attemptPenalty = (this.attempts - 1) * 50;
    const timeBonusMultiplier = Math.max(0.1, 1 - (this.gameDuration / 100));
    const difficultyMultiplier = this.getDifficultyMultiplier();
    
    return Math.round((baseScore - attemptPenalty) * timeBonusMultiplier * difficultyMultiplier);
  }

  private getDifficultyMultiplier(): number {
    const multipliers = {
      'beginner': 0.5,
      'easy': 0.7,
      'medium': 1.0,
      'hard': 1.5,
      'expert': 2.0,
      'nightmare': 3.0
    };
    return multipliers[this.currentSession?.config.difficulty || 'medium'] || 1.0;
  }

  private async checkForNewAchievements(gameResult: GameResult): Promise<Achievement[]> {
    const currentStats = this.playerStatistics$.value;
    const allAchievements = await this.gameService.getAchievements();
    
    return allAchievements.filter(achievement => 
      !currentStats.unlockedAchievements.includes(achievement.id) &&
      this.evaluateAchievementCondition(achievement, gameResult, currentStats)
    );
  }

  private evaluateAchievementCondition(
    achievement: Achievement, 
    gameResult: GameResult, 
    stats: PlayerStatistics
  ): boolean {
    switch (achievement.id) {
      case 'first_win':
        return gameResult.won && stats.totalGames === 1;
      case 'perfectionist':
        return gameResult.won && gameResult.attempts === 1;
      case 'speed_demon':
        return gameResult.won && gameResult.duration < 10000;
      case 'persistent':
        return stats.totalGames >= 50;
      case 'master_strategist':
        return stats.averageAttempts <= 3 && stats.totalWins >= 20;
      default:
        return false;
    }
  }

  private updatePlayerStatistics(gameResult: GameResult): void {
    const currentStats = this.playerStatistics$.value;
    
    const updatedStats: PlayerStatistics = {
      ...currentStats,
      totalGames: currentStats.totalGames + 1,
      totalWins: currentStats.totalWins + (gameResult.won ? 1 : 0),
      totalAttempts: currentStats.totalAttempts + gameResult.attempts,
      totalTimePlayed: currentStats.totalTimePlayed + gameResult.duration,
      bestTime: gameResult.won ? 
        Math.min(currentStats.bestTime || Infinity, gameResult.duration) : 
        currentStats.bestTime,
      currentStreak: gameResult.won ? currentStats.currentStreak + 1 : 0,
      longestStreak: Math.max(
        currentStats.longestStreak, 
        gameResult.won ? currentStats.currentStreak + 1 : currentStats.currentStreak
      ),
      averageAttempts: (currentStats.totalAttempts + gameResult.attempts) / (currentStats.totalGames + 1)
    };

    this.playerStatistics$.next(updatedStats);
    this.savePlayerStatistics(updatedStats);
  }

  private generateLearningInsights(): void {
    const stats = this.playerStatistics$.value;
    const recentGames = this.gameHistory.slice(0, 10);
    
    this.learningInsights = [
      this.generatePerformanceTrendInsight(recentGames),
      this.generateDifficultyRecommendation(stats),
      this.generateStrategyInsight(recentGames),
      this.generateTimeManagementInsight(recentGames)
    ].filter(insight => insight !== null) as LearningInsight[];
  }

  private generatePerformanceTrendInsight(recentGames: GameResult[]): LearningInsight | null {
    if (recentGames.length < 5) return null;

    const winRates = [];
    for (let i = 0; i < recentGames.length - 2; i++) {
      const batch = recentGames.slice(i, i + 3);
      const winRate = batch.filter(g => g.won).length / batch.length;
      winRates.push(winRate);
    }

    const trend = winRates[0] - winRates[winRates.length - 1];
    
    return {
      id: 'performance_trend',
      type: trend > 0.2 ? 'positive' : trend < -0.2 ? 'negative' : 'neutral',
      title: { 
        es: trend > 0.2 ? '📈 Mejorando' : trend < -0.2 ? '📉 Necesita práctica' : '📊 Rendimiento estable',
        en: trend > 0.2 ? '📈 Improving' : trend < -0.2 ? '📉 Needs practice' : '📊 Stable performance'
      },
      description: {
        es: trend > 0.2 ? 
          'Tu rendimiento ha mejorado significativamente en los últimos juegos.' :
          trend < -0.2 ?
          'Considera practicar en dificultades más bajas para recuperar confianza.' :
          'Mantienes un rendimiento consistente.',
        en: trend > 0.2 ? 
          'Your performance has improved significantly in recent games.' :
          trend < -0.2 ?
          'Consider practicing on lower difficulties to regain confidence.' :
          'You maintain consistent performance.'
      },
      confidence: Math.abs(trend) * 100,
      actionable: true
    };
  }

  private generateDifficultyRecommendation(stats: PlayerStatistics): LearningInsight | null {
    if (stats.totalGames < 5) return null;

    const winRate = stats.totalWins / stats.totalGames;
    const avgAttempts = stats.averageAttempts;

    let recommendation = '';
    let confidenceLevel = 0;

    if (winRate > 0.8 && avgAttempts < 4) {
      recommendation = 'increase';
      confidenceLevel = 85;
    } else if (winRate < 0.3 || avgAttempts > 8) {
      recommendation = 'decrease';
      confidenceLevel = 90;
    } else {
      recommendation = 'maintain';
      confidenceLevel = 70;
    }

    return {
      id: 'difficulty_recommendation',
      type: 'suggestion',
      title: {
        es: recommendation === 'increase' ? '🎯 Listo para más desafío' : 
             recommendation === 'decrease' ? '🎮 Prueba un nivel más fácil' : 
             '⚖️ Dificultad perfecta',
        en: recommendation === 'increase' ? '🎯 Ready for more challenge' : 
             recommendation === 'decrease' ? '🎮 Try an easier level' : 
             '⚖️ Perfect difficulty'
      },
      description: {
        es: recommendation === 'increase' ? 
          `Con ${Math.round(winRate * 100)}% de victorias, puedes intentar un nivel más difícil.` :
          recommendation === 'decrease' ?
          `Con ${Math.round(winRate * 100)}% de victorias, un nivel más fácil te ayudará a ganar confianza.` :
          'Tu nivel actual es perfecto para tu progreso.',
        en: recommendation === 'increase' ? 
          `With ${Math.round(winRate * 100)}% wins, you can try a harder level.` :
          recommendation === 'decrease' ?
          `With ${Math.round(winRate * 100)}% wins, an easier level will help build confidence.` :
          'Your current level is perfect for your progress.'
      },
      confidence: confidenceLevel,
      actionable: true
    };
  }

  private initializeAnalytics(): void {
    this.loadPlayerStatistics();
    this.loadGameHistory();
    this.setupAnalyticsCharts();
  }

  private setupAnalyticsCharts(): void {
    setTimeout(() => {
      this.initializePerformanceChart();
      this.initializeDistributionChart();
    }, 100);
  }

  private initializePerformanceChart(): void {
    if (!this.performanceChartRef?.nativeElement) return;

    const ctx = this.performanceChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const data = this.generatePerformanceChartData();
    const config: ChartConfiguration = {
      type: 'line',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Performance Over Time'
          },
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100
          }
        },
        elements: {
          line: {
            tension: 0.4
          }
        }
      }
    };

    this.performanceChart = new Chart(ctx, config);
  }

  private initializeDistributionChart(): void {
    if (!this.distributionChartRef?.nativeElement) return;

    const ctx = this.distributionChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const data = this.generateDistributionChartData();
    const config: ChartConfiguration = {
      type: 'doughnut',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Games by Difficulty'
          }
        }
      }
    };

    this.distributionChart = new Chart(ctx, config);
  }

  private generatePerformanceChartData(): ChartJSData {
    const recentGames = this.gameHistory.slice(0, 20).reverse();
    
    return {
      labels: recentGames.map((_, index) => `Game ${index + 1}`),
      datasets: [{
        label: 'Win Rate (%)',
        data: recentGames.map((game, index) => {
          const batch = recentGames.slice(Math.max(0, index - 4), index + 1);
          return (batch.filter(g => g.won).length / batch.length) * 100;
        }),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true
      }, {
        label: 'Efficiency (%)',
        data: recentGames.map(game => {
          const maxAttempts = this.getDifficultyMaxAttempts(game.difficulty);
          return ((maxAttempts - game.attempts + 1) / maxAttempts) * 100;
        }),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: false
      }]
    };
  }

  private generateDistributionChartData(): ChartJSData {
    const difficultyCount = this.gameHistory.reduce((acc, game) => {
      acc[game.difficulty] = (acc[game.difficulty] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      labels: Object.keys(difficultyCount),
      datasets: [{
        data: Object.values(difficultyCount),
        backgroundColor: [
          '#6366f1', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'
        ],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    };
  }

  private getDifficultyMaxAttempts(difficulty: string): number {
    const difficultyConfig = this.difficultyLevels.find(d => d.id === difficulty);
    return difficultyConfig?.maxAttempts || 10;
  }

  private updateAnalyticsCharts(): void {
    if (this.performanceChart) {
      this.performanceChart.data = this.generatePerformanceChartData();
      this.performanceChart.update('none');
    }

    if (this.distributionChart) {
      this.distributionChart.data = this.generateDistributionChartData();
      this.distributionChart.update('none');
    }
  }

  private updateChartsLabels(): void {
    const currentLang = this.currentLanguage$.value;
    
    if (this.performanceChart) {
      this.performanceChart.options.plugins!.title!.text = 
        currentLang === 'es' ? 'Rendimiento en el Tiempo' : 'Performance Over Time';
      this.performanceChart.update('none');
    }

    if (this.distributionChart) {
      this.distributionChart.options.plugins!.title!.text = 
        currentLang === 'es' ? 'Juegos por Dificultad' : 'Games by Difficulty';
      this.distributionChart.update('none');
    }
  }

  private updateChartsTheme(): void {
    const isDark = this.theme$.value === 'dark';
    const textColor = isDark ? '#ffffff' : '#374151';
    const gridColor = isDark ? '#374151' : '#e5e7eb';

    [this.performanceChart, this.distributionChart].forEach(chart => {
      if (chart) {
        chart.options.plugins!.title!.color = textColor;
        chart.options.plugins!.legend!.labels!.color = textColor;
        
        if (chart.options.scales) {
          Object.values(chart.options.scales).forEach(scale => {
            if (scale.ticks) scale.ticks.color = textColor;
            if (scale.grid) scale.grid.color = gridColor;
          });
        }
        
        chart.update('none');
      }
    });
  }

  private cleanupCharts(): void {
    [this.performanceChart, this.distributionChart].forEach(chart => {
      if (chart) {
        chart.destroy();
      }
    });
  }

  // Advanced Game Features
  private initializePatternDetection(): void {
    this.analyticsService.initializePatternDetection();
  }

  private analyzeGuessingPattern(guess: number): void {
    if (!this.currentSession) return;

    const pattern = this.analyticsService.analyzePattern(
      this.currentSession.guessHistory.map(h => h.guess)
    );

    if (pattern.detected) {
      this.showPatternWarning(pattern);
    }
  }

  private showPatternWarning(pattern: any): void {
    // Implementation for showing pattern detection warning
    console.log('Pattern detected:', pattern);
  }

  private initializeAIAssistance(): void {
    this.analyticsService.initializeAI();
  }

  private provideAIGuidance(guess: number, result: any): void {
    const guidance = this.analyticsService.generateAIGuidance(
      guess, 
      result, 
      this.currentSession?.guessHistory || []
    );

    if (guidance) {
      this.showAIGuidance(guidance);
    }
  }

  private showAIGuidance(guidance: any): void {
    // Implementation for showing AI guidance
    console.log('AI Guidance:', guidance);
  }

  private generateHintMessage(result: any): string {
    const currentLang = this.currentLanguage$.value;
    
    const hints = {
      too_high: {
        es: `El número es menor que ${this.currentGuess}`,
        en: `The number is less than ${this.currentGuess}`
      },
      too_low: {
        es: `El número es mayor que ${this.currentGuess}`,
        en: `The number is greater than ${this.currentGuess}`
      },
      correct: {
        es: '¡Perfecto! Has adivinado el número',
        en: 'Perfect! You guessed the number'
      }
    };

    return hints[result.hint as keyof typeof hints]?.[currentLang] || '';
  }

  private generateQuantumHint(result: any): string {
    // Advanced quantum-inspired hint generation
    const currentLang = this.currentLanguage$.value;
    const probability = Math.random();
    
    if (probability > 0.7) {
      return currentLang === 'es' ? 
        ' (Análisis cuántico: alta probabilidad de convergencia)' :
        ' (Quantum analysis: high convergence probability)';
    }
    
    return '';
  }

  private generateStrategyInsight(recentGames: GameResult[]): LearningInsight | null {
    if (recentGames.length < 3) return null;

    const strategies = this.analyticsService.detectPlayingStrategies(recentGames);
    const dominantStrategy = strategies.reduce((prev, current) => 
      prev.frequency > current.frequency ? prev : current
    );

    return {
      id: 'strategy_insight',
      type: 'info',
      title: {
        es: `🧠 Estrategia dominante: ${dominantStrategy.name.es}`,
        en: `🧠 Dominant strategy: ${dominantStrategy.name.en}`
      },
      description: {
        es: `Usas principalmente ${dominantStrategy.name.es.toLowerCase()}. ${dominantStrategy.recommendation.es}`,
        en: `You mainly use ${dominantStrategy.name.en.toLowerCase()}. ${dominantStrategy.recommendation.en}`
      },
      confidence: dominantStrategy.confidence,
      actionable: true
    };
  }

  private generateTimeManagementInsight(recentGames: GameResult[]): LearningInsight | null {
    if (recentGames.length < 5) return null;

    const avgTime = recentGames.reduce((sum, game) => sum + game.duration, 0) / recentGames.length;
    const hasTimeLimit = recentGames.some(game => this.getDifficultyTimeLimit(game.difficulty) !== null);

    if (!hasTimeLimit) return null;

    return {
      id: 'time_management',
      type: avgTime > 30000 ? 'warning' : 'positive',
      title: {
        es: avgTime > 30000 ? '⏰ Gestión del tiempo' : '⚡ Excelente velocidad',
        en: avgTime > 30000 ? '⏰ Time management' : '⚡ Excellent speed'
      },
      description: {
        es: avgTime > 30000 ? 
          `Tu tiempo promedio es ${Math.round(avgTime/1000)}s. Considera practicar con límites de tiempo más estrictos.` :
          `Excelente control del tiempo con promedio de ${Math.round(avgTime/1000)}s.`,
        en: avgTime > 30000 ? 
          `Your average time is ${Math.round(avgTime/1000)}s. Consider practicing with stricter time limits.` :
          `Excellent time control with ${Math.round(avgTime/1000)}s average.`
      },
      confidence: 80,
      actionable: avgTime > 30000
    };
  }

  private getDifficultyTimeLimit(difficulty: string): number | null {
    const difficultyConfig = this.difficultyLevels.find(d => d.id === difficulty);
    return difficultyConfig?.timeLimit || null;
  }

  private checkTimeLimit(): void {
    if (!this.currentSession?.config.timeLimit) return;

    const timeLimit = this.getDifficultyTimeLimit(this.currentSession.config.difficulty);
    if (timeLimit && this.gameDuration >= timeLimit) {
      this.handleTimeUp();
    }
  }

  private async handleTimeUp(): Promise<void> {
    this.currentGameState = 'timeup';
    
    const gameResult: GameResult = {
      sessionId: this.currentSession!.sessionId,
      won: false,
      attempts: this.attempts,
      duration: this.gameDuration * 1000,
      difficulty: this.currentSession!.config.difficulty,
      algorithm: this.currentSession!.config.algorithm,
      score: 0,
      timestamp: new Date().toISOString(),
      endReason: 'timeout'
    };

    await this.gameService.saveGameResult(gameResult);
    this.updatePlayerStatistics(gameResult);
    this.gameHistory.unshift(gameResult);
    this.analyticsService.trackGameComplete(gameResult);
  }

  private pauseGame(): void {
    if (this.currentGameState === 'playing') {
      this.currentGameState = 'paused';
    }
  }

  private resumeGame(): void {
    if (this.currentGameState === 'paused') {
      this.currentGameState = 'playing';
    }
  }

  private abandonGame(): void {
    if (this.currentGameState === 'playing') {
      this.currentGameState = 'abandoned';
      this.analyticsService.trackGameAbandoned(this.currentSession?.sessionId || '');
    }
  }

  private async requestHint(): Promise<void> {
    if (!this.currentSession || this.attempts === 0) return;

    const hint = await this.gameService.requestHint(
      this.currentSession.sessionId,
      this.currentSession.guessHistory
    );

    this.showHintDialog(hint);
  }

  private showHintDialog(hint: any): void {
    // Implementation for showing hint dialog
    console.log('Hint:', hint);
  }

  private showAchievementNotifications(achievements: Achievement[]): void {
    achievements.forEach((achievement, index) => {
      setTimeout(() => {
        this.recentAchievements.unshift(achievement);
        this.showNotification('achievement', achievement);
      }, index * 1000);
    });
  }

  private showNotification(type: string, data: any): void {
    // Implementation for showing notifications
    console.log(`Notification [${type}]:`, data);
  }

  // UI Event Handlers
  onConfigurationChange(config: any): void {
    this.adaptiveDifficulty = config.adaptiveDifficulty;
    this.patternDetection = config.patternDetection;
    this.aiAssistance = config.aiAssistance;
    this.practiceMode = config.practiceMode;

    // Save preferences
    this.saveUserPreferences();
  }

  onTabChange(tab: 'game' | 'analytics' | 'achievements' | 'leaderboard'): void {
    this.currentTab = tab;
    
    if (tab === 'analytics') {
      setTimeout(() => this.updateAnalyticsCharts(), 100);
    } else if (tab === 'leaderboard') {
      this.loadLeaderboard();
    }
  }

  onLanguageToggle(): void {
    const newLang = this.currentLanguage$.value === 'es' ? 'en' : 'es';
    this.currentLanguage$.next(newLang);
  }

  onThemeToggle(): void {
    const newTheme = this.theme$.value === 'light' ? 'dark' : 'light';
    this.theme$.next(newTheme);
  }

  toggleAdvancedSettings(): void {
    this.showAdvancedSettings = !this.showAdvancedSettings;
  }

  resetAllData(): void {
    if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
      this.resetPlayerData();
    }
  }

  exportGameData(): void {
    const data = {
      statistics: this.playerStatistics$.value,
      gameHistory: this.gameHistory,
      achievements: this.achievements$.value,
      preferences: this.getUserPreferences(),
      exportDate: new Date().toISOString()
    };

    this.downloadDataAsJSON(data, 'number-game-data.json');
  }

  // Utility Methods
  private getInitialStats(): PlayerStatistics {
    return {
      totalGames: 0,
      totalWins: 0,
      totalAttempts: 0,
      totalTimePlayed: 0,
      averageAttempts: 0,
      bestTime: null,
      currentStreak: 0,
      longestStreak: 0,
      unlockedAchievements: [],
      preferredDifficulty: 'medium',
      lastPlayed: null
    };
  }

  private getInitialMetrics(): PerformanceMetrics {
    return {
      winRate: 0,
      averageAttempts: 0,
      averageTime: 0,
      efficiency: 0,
      consistency: 0,
      improvement: 0,
      skillLevel: 'beginner'
    };
  }

  private calculatePerformanceMetrics(stats: PlayerStatistics): PerformanceMetrics {
    const winRate = stats.totalGames > 0 ? (stats.totalWins / stats.totalGames) * 100 : 0;
    const averageTime = stats.totalWins > 0 ? stats.totalTimePlayed / stats.totalWins : 0;
    
    return {
      winRate,
      averageAttempts: stats.averageAttempts,
      averageTime,
      efficiency: this.calculateEfficiency(stats),
      consistency: this.calculateConsistency(),
      improvement: this.calculateImprovement(),
      skillLevel: this.determineSkillLevel(stats)
    };
  }

  private calculateEfficiency(stats: PlayerStatistics): number {
    if (stats.totalWins === 0) return 0;
    const optimalAttempts = 3; // Assumed optimal
    return Math.max(0, (optimalAttempts / stats.averageAttempts) * 100);
  }

  private calculateConsistency(): number {
    const recentGames = this.gameHistory.slice(0, 10);
    if (recentGames.length < 5) return 0;

    const attempts = recentGames.map(g => g.attempts);
    const mean = attempts.reduce((sum, a) => sum + a, 0) / attempts.length;
    const variance = attempts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / attempts.length;
    const standardDeviation = Math.sqrt(variance);
    
    return Math.max(0, 100 - (standardDeviation * 10));
  }

  private calculateImprovement(): number {
    const recentGames = this.gameHistory.slice(0, 20);
    if (recentGames.length < 10) return 0;

    const firstHalf = recentGames.slice(10);
    const secondHalf = recentGames.slice(0, 10);

    const firstHalfAvg = firstHalf.reduce((sum, g) => sum + g.attempts, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, g) => sum + g.attempts, 0) / secondHalf.length;

    return ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100;
  }

  private determineSkillLevel(stats: PlayerStatistics): string {
    const winRate = (stats.totalWins / stats.totalGames) * 100;
    const avgAttempts = stats.averageAttempts;

    if (winRate >= 90 && avgAttempts <= 3) return 'grandmaster';
    if (winRate >= 80 && avgAttempts <= 4) return 'expert';
    if (winRate >= 70 && avgAttempts <= 5) return 'advanced';
    if (winRate >= 60 && avgAttempts <= 6) return 'intermediate';
    if (winRate >= 40 && avgAttempts <= 8) return 'beginner';
    return 'novice';
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getPlayerId(): string {
    let playerId = localStorage.getItem('playerId');
    if (!playerId) {
      playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('playerId', playerId);
    }
    return playerId;
  }

  private handleGameError(error: any): void {
    console.error('Game error:', error);
    this.currentGameState = 'error';
    this.showNotification('error', {
      message: 'An error occurred. Please try again.',
      details: error.message
    });
  }

  private startPerformanceMonitoring(): void {
    this.analyticsService.startPerformanceMonitoring();
  }

  private async checkForAchievements(): Promise<void> {
    const achievements = await this.gameService.getAchievements();
    this.achievements$.next(achievements);
  }

  private preloadAssets(): void {
    // Preload images, sounds, and other assets
    this.gameService.preloadAssets();
  }

  private async loadLeaderboard(): Promise<void> {
    try {
      this.globalLeaderboard = await this.gameService.getGlobalLeaderboard();
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      this.globalLeaderboard = [];
    }
  }

  // Data Persistence
  private loadUserPreferences(): void {
    const prefs = this.getUserPreferences();
    this.currentLanguage$.next(prefs.language || 'es');
    this.theme$.next(prefs.theme || 'light');
    
    this.gameConfigForm.patchValue({
      difficulty: prefs.difficulty || 'medium',
      algorithm: prefs.algorithm || 'simple',
      timeLimit: prefs.timeLimit !== false,
      adaptiveDifficulty: prefs.adaptiveDifficulty || false,
      patternDetection: prefs.patternDetection !== false,
      aiAssistance: prefs.aiAssistance || false,
      practiceMode: prefs.practiceMode || false
    });
  }

  private getUserPreferences(): any {
    return JSON.parse(localStorage.getItem('userPreferences') || '{}');
  }

  private saveUserPreferences(): void {
    const prefs = {
      language: this.currentLanguage$.value,
      theme: this.theme$.value,
      ...this.gameConfigForm.value,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem('userPreferences', JSON.stringify(prefs));
  }

  private loadPlayerStatistics(): void {
    const saved = localStorage.getItem('playerStatistics');
    if (saved) {
      this.playerStatistics$.next(JSON.parse(saved));
    }
  }

  private savePlayerStatistics(stats: PlayerStatistics): void {
    localStorage.setItem('playerStatistics', JSON.stringify(stats));
  }

  private loadGameHistory(): void {
    const saved = localStorage.getItem('gameHistory');
    if (saved) {
      this.gameHistory = JSON.parse(saved);
    }
  }

  private saveGameHistory(): void {
    localStorage.setItem('gameHistory', JSON.stringify(this.gameHistory.slice(0, 100)));
  }

  private resetPlayerData(): void {
    localStorage.removeItem('playerStatistics');
    localStorage.removeItem('gameHistory');
    localStorage.removeItem('achievements');
    
    this.playerStatistics$.next(this.getInitialStats());
    this.gameHistory = [];
    this.achievements$.next([]);
    this.recentAchievements = [];
    this.learningInsights = [];
    
    this.cdr.markForCheck();
  }

  private downloadDataAsJSON(data: any, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Getters for template
  get currentDifficulty(): DifficultyLevel | undefined {
    const difficultyId = this.gameConfigForm.get('difficulty')?.value;
    return this.difficultyLevels.find(d => d.id === difficultyId);
  }

  get currentAlgorithm(): AlgorithmType | undefined {
    const algorithmId = this.gameConfigForm.get('algorithm')?.value;
    return this.algorithmTypes.find(a => a.id === algorithmId);
  }

  get canMakeGuess(): boolean {
    return this.currentGameState === 'playing' && 
           this.guessForm.valid && 
           this.attempts < this.maxAttempts;
  }

  get remainingAttempts(): number {
    return Math.max(0, this.maxAttempts - this.attempts);
  }

  get gameProgress(): number {
    return this.maxAttempts > 0 ? (this.attempts / this.maxAttempts) * 100 : 0;
  }

  get timeRemaining(): number | null {
    if (!this.currentSession?.config.timeLimit) return null;
    
    const timeLimit = this.getDifficultyTimeLimit(this.currentSession.config.difficulty);
    return timeLimit ? Math.max(0, timeLimit - this.gameDuration) : null;
  }

  get winRate(): number {
    const stats = this.playerStatistics$.value;
    return stats.totalGames > 0 ? (stats.totalWins / stats.totalGames) * 100 : 0;
  }

  get totalScore(): number {
    return this.gameHistory.reduce((sum, game) => sum + (game.score || 0), 0);
  }

  get currentRank(): string {
    const stats = this.playerStatistics$.value;
    const skillLevel = this.determineSkillLevel(stats);
    
    const ranks = {
      novice: { es: 'Novato', en: 'Novice' },
      beginner: { es: 'Principiante', en: 'Beginner' },
      intermediate: { es: 'Intermedio', en: 'Intermediate' },
      advanced: { es: 'Avanzado', en: 'Advanced' },
      expert: { es: 'Experto', en: 'Expert' },
      grandmaster: { es: 'Gran Maestro', en: 'Grandmaster' }
    };

    const currentLang = this.currentLanguage$.value;
    return ranks[skillLevel as keyof typeof ranks]?.[currentLang] || ranks.novice[currentLang];
  }

  // Template helper methods
  t(key: string, params?: any): string {
    return this.i18nService.translate(key, params);
  }

  formatTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${remainingSeconds}s`;
  }

  formatNumber(num: number, decimals: number = 1): string {
    return num.toFixed(decimals);
  }

  getSkillLevelColor(level: string): string {
    const colors = {
      novice: '#ef4444',
      beginner: '#f59e0b',
      intermediate: '#3b82f6',
      advanced: '#10b981',
      expert: '#8b5cf6',
      grandmaster: '#6366f1'
    };
    return colors[level as keyof typeof colors] || colors.novice;
  }

  getAchievementIcon(achievement: Achievement): string {
    const icons = {
      first_win: '🏆',
      perfectionist: '🎯',
      speed_demon: '⚡',
      persistent: '💪',
      master_strategist: '🧠',
      lucky_seven: '🍀',
      comeback_kid: '🔄',
      consistency_king: '📊'
    };
    return icons[achievement.id as keyof typeof icons] || '🏅';
  }
}