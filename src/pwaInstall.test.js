import { describe, expect, it } from 'vitest';
import {
  buildInstallGuideContent,
  detectInstallPlatform,
  getPwaInstallState
} from './pwaInstall.js';

describe('PWA install platform detection and guided fallback helpers', () => {
  it('detects iPhone, iPadOS desktop-UA, Android Chrome, and in-app browsers accurately', () => {
    const iosSafari = detectInstallPlatform({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
      inIframe: false,
      protocol: 'https:'
    });
    expect(iosSafari).toMatchObject({ isIos: true, isSafari: true, isAndroid: false, isInAppBrowser: false });

    const ipadosSafari = detectInstallPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      inIframe: false,
      protocol: 'https:'
    });
    expect(ipadosSafari).toMatchObject({ isIos: true, isSafari: true });

    const lineInApp = detectInstallPlatform({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1 Line/14.1.0',
      platform: 'iPhone',
      maxTouchPoints: 5,
      inIframe: false,
      protocol: 'https:'
    });
    expect(lineInApp).toMatchObject({ isIos: true, isInAppBrowser: true });
  });

  it('builds tailored Thai fallback guidance for standalone, iOS Safari, in-app browsers, and desktop iframe/chrome', () => {
    const iosGuide = buildInstallGuideContent(
      detectInstallPlatform({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        maxTouchPoints: 5,
        inIframe: false
      }),
      false
    );
    expect(iosGuide.headline).toContain('iPhone / iPad');
    expect(iosGuide.steps.some(s => s.includes('เพิ่มไปยังหน้าจอโฮม'))).toBe(true);

    const inAppGuide = buildInstallGuideContent(
      detectInstallPlatform({
        userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 FBAV/440.0',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
        inIframe: false
      }),
      false
    );
    expect(inAppGuide.steps.some(s => s.includes('Chrome'))).toBe(true);

    const desktopIframeGuide = buildInstallGuideContent(
      detectInstallPlatform({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
        platform: 'Win32',
        maxTouchPoints: 0,
        inIframe: true
      }),
      false
    );
    expect(desktopIframeGuide.note).toContain('iframe');
  });

  it('keeps the install button visible on non-standalone browsers and hides it when standalone', () => {
    const browserState = getPwaInstallState({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      platform: 'Win32',
      maxTouchPoints: 0,
      standalone: false,
      inIframe: false,
      protocol: 'https:'
    });
    expect(browserState.showButton).toBe(true);
    expect(browserState.alreadyInstalled).toBe(false);

    const standaloneState = getPwaInstallState({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
      standalone: true,
      inIframe: false,
      protocol: 'https:'
    });
    expect(standaloneState.showButton).toBe(false);
    expect(standaloneState.alreadyInstalled).toBe(true);
    expect(standaloneState.statusText).toContain('โหมดแอปแล้ว');
  });
});
