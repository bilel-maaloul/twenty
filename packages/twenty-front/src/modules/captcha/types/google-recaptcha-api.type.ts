export type GoogleRecaptchaV2RenderParameters = {
  sitekey: string;
  size: 'normal';
  theme: 'dark' | 'light';
  callback: (response: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

export type GoogleRecaptchaApi = {
  ready: (callback: () => void) => void;
  render: (
    container: HTMLElement,
    parameters: GoogleRecaptchaV2RenderParameters,
  ) => number;
  reset: (widgetId?: number) => void;
};

export type CaptchaWindow = Window & {
  grecaptcha?: GoogleRecaptchaApi;
};
