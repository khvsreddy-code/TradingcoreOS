export const BROKER_OAUTH_CHANNEL = 'tradingcore-broker-oauth-v1';

export interface PopupOptions {
  width?: number;
  height?: number;
  title?: string;
}

export class PopupManager {
  private static activePopup: Window | null = null;

  public static openPopup(url: string, options: PopupOptions = {}): Window | null {
    const width = options.width || 600;
    const height = options.height || 720;
    const title = options.title || 'Broker_OAuth_Authorization';
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    if (this.activePopup && !this.activePopup.closed) this.activePopup.close();

    const windowFeatures = `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes,toolbar=no,menubar=no`;
    this.activePopup = window.open(url, title, windowFeatures);
    if (!this.activePopup) console.warn('Popup blocker prevented opening authorization window automatically.');
    return this.activePopup;
  }

  public static closePopup(): void {
    if (this.activePopup && !this.activePopup.closed) this.activePopup.close();
    this.activePopup = null;
  }
}
