import { useAppStore } from '../store/appStore';

export class ApiErrorHandler {
  private static instance: ApiErrorHandler | null = null;

  static getInstance(): ApiErrorHandler {
    if (!ApiErrorHandler.instance) {
      ApiErrorHandler.instance = new ApiErrorHandler();
    }
    return ApiErrorHandler.instance;
  }

  public handleError(error: unknown, customMessage?: string): void {
    const { notify } = useAppStore.getState();

    let message = customMessage || 'Произошла ошибка. Попробуйте еще раз.';

    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
        message = 'Ошибка сети. Проверьте подключение к интернету.';
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        message = 'Ошибка авторизации. Попробуйте перезагрузить страницу.';
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        message = 'Недостаточно прав для выполнения операции.';
      } else if (error.message.includes('404') || error.message.includes('Not Found')) {
        message = 'Запрашиваемый ресурс не найден.';
      } else if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
        message = 'Ошибка сервера. Попробуйте позже.';
      } else if (customMessage) {
        message = customMessage;
      }
    }

    console.error('API Error:', error);
    notify(message, 'error');
  }

  public handleSuccess(message: string): void {
    const { notify } = useAppStore.getState();
    notify(message, 'success');
  }

  public handleInfo(message: string): void {
    const { notify } = useAppStore.getState();
    notify(message, 'info');
  }
}

export const apiErrorHandler = ApiErrorHandler.getInstance();

export const useApiErrorHandler = () => {
  const { notify } = useAppStore();

  const handleError = (error: unknown, customMessage?: string) => {
    let message = customMessage || 'Произошла ошибка. Попробуйте еще раз.';

    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
        message = 'Ошибка сети. Проверьте подключение к интернету.';
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        message = 'Ошибка авторизации. Попробуйте перезагрузить страницу.';
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        message = 'Недостаточно прав для выполнения операции.';
      } else if (error.message.includes('404') || error.message.includes('Not Found')) {
        message = 'Запрашиваемый ресурс не найден.';
      } else if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
        message = 'Ошибка сервера. Попробуйте позже.';
      }
    }

    console.error('API Error:', error);
    notify(message, 'error');
  };

  const handleSuccess = (message: string) => {
    notify(message, 'success');
  };

  const handleInfo = (message: string) => {
    notify(message, 'info');
  };

  return { handleError, handleSuccess, handleInfo };
};
