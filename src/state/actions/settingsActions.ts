import type { ThemeId } from '../../theme';
import type { UpdatePreferences } from '../storeTypes';
import type { ActionContext } from './types';

export function createSettingsActions({ dispatch }: ActionContext) {
  const setUpdatePreferences = (patch: Partial<UpdatePreferences>) => dispatch({ type: 'update-preferences', patch });

  const clearError = () => {
    dispatch({ type: 'clear-error' });
  };

  const setThemeId = (themeId: ThemeId) => {
    dispatch({ type: 'set-theme-id', themeId });
  };

  const updateProfile = (name: string, signature: string, avatarUri: string | null) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      dispatch({ type: 'set-error', error: '用户名不能为空。' });
      return false;
    }
    dispatch({
      type: 'update-profile',
      name: trimmedName,
      signature: signature.trim(),
      avatarUri,
    });
    return true;
  };

  return { setUpdatePreferences, clearError, setThemeId, updateProfile };
}
