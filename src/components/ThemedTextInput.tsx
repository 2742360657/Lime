import { forwardRef } from 'react';
import { TextInput as NativeTextInput, type TextInputProps } from 'react-native';
import { useTheme } from '../state/AppProvider';

export type ThemedTextInput = NativeTextInput;

/** Keep native cursor, selection and underline independent of Android's fixed accent. */
export const ThemedTextInput = forwardRef<NativeTextInput, TextInputProps>((props, ref) => {
  const theme = useTheme();
  return <NativeTextInput ref={ref}
    placeholderTextColor={theme.colors.textMuted}
    cursorColor={theme.colors.primary}
    selectionHandleColor={theme.colors.primary}
    selectionColor={theme.colors.primarySoft}
    underlineColorAndroid="transparent"
    disableFullscreenUI
    {...props} />;
});
ThemedTextInput.displayName = 'ThemedTextInput';
