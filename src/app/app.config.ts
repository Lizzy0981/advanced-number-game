import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter }                from '@angular/router';
import { provideHttpClient }            from '@angular/common/http';
import { provideAnimations }            from '@angular/platform-browser/animations';
import { provideServiceWorker }         from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter([]),
    provideHttpClient(),
    provideAnimations(),
    provideServiceWorker('ngsw-worker.js', {
      enabled:             !isDevMode(),
      registrationStrategy:'registerWhenStable:30000',
    }),
  ],
};
