import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, findNodeHandle, Keyboard, KeyboardAvoidingView, Modal, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MemoScroll from '../native/NativeMemoScroll';
import { useBackHandler } from '../navigation/back';
import { useAppSelector, useAppStore, useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';
import type { Memo } from '../types/app';
import { GroupPickerModal } from './GroupPickerModal';
import { Alert } from './ThemedAlert';
import { ThemedTextInput as TextInput } from './ThemedTextInput';

/** 新建/编辑页：只有标题、分类和正文；返回时先确认保存，右上角也提供保存入口。 */
export function MemoEditor({
  memo,
  initialGroupId,
  groupOptions,
  isNew,
  onClose,
  onDiscard,
  onChange,
}: {
  memo: Memo;
  isNew: boolean;
  initialGroupId: string | null;
  groupOptions: Array<{ id: string | null; label: string }>;
  onClose: () => void;
  onDiscard: () => void;
  onChange: (patch: Partial<Pick<Memo, 'title' | 'body' | 'groupId'>>) => void;
}) {
  const theme = useTheme();
  const store = useAppStore();
  const saveStatus = useAppSelector(s => s.saveStatus);
  const [closing, setClosing] = useState(false);
  const [published, setPublished] = useState({ title: memo.title, body: memo.body, groupId: memo.groupId });
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [title, setTitle] = useState(memo.title);
  const [body, setBody] = useState(memo.body);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const bodyRef = useRef<TextInput>(null);
  const scrollTag = useRef<number | null>(null);
  const attachScrolling = useCallback(() => {
    const tag = findNodeHandle(bodyRef.current);
    if (tag === null || scrollTag.current === tag) return;
    scrollTag.current = tag;
    void MemoScroll.attach(tag).catch(error => {
      scrollTag.current = null;
      if (__DEV__) console.warn('Native memo scrolling could not attach', error);
    });
  }, []);
  useEffect(() => () => {
    if (scrollTag.current !== null) MemoScroll.detach(scrollTag.current);
  }, []);
  const [initialSelection, setInitialSelection] = useState(true);
  const bodyTouch = useRef({ x: 0, y: 0, dragged: false });
  const [keyboardRequested, setKeyboardRequested] = useState(false);
  useEffect(() => {
    const listener = Keyboard.addListener('keyboardDidHide', () => setKeyboardRequested(false));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    // Native drags can focus EditText without opening IME. TextInput.focus()
    // then short-circuits in JS, so send the existing native focus command
    // after committing showSoftInputOnFocus. This also handles Android Back.
    if (keyboardRequested) {
      const tag = findNodeHandle(bodyRef.current);
      if (tag !== null) {
        bodyRef.current?.setNativeProps({ showSoftInputOnFocus: true });
        const frame = requestAnimationFrame(() => UIManager.dispatchViewManagerCommand(tag, 'focus', []));
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [keyboardRequested]);
  const initialRef = useRef({ title: memo.title, body: memo.body, groupId: memo.groupId });
  // 与打开编辑器时的快照比较：自动保存会同步更新 memo，拿 memo 比对会让“有改动”在
  // 600ms 自动保存后永远变成 false，返回时便不再询问是否保存。
  const dirty =
    title !== initialRef.current.title ||
    body !== initialRef.current.body ||
    groupId !== initialRef.current.groupId;
  const hasContent = title.trim() !== '' || body.trim() !== '';

  // 输入停顿后自动写回，避免切走应用时丢掉正在编辑的内容。
  useEffect(() => {
    if (closing || !dirty || !hasContent) {
      return;
    }
    const timer = setTimeout(() => {
      onChange({ title, body, groupId });
      setPublished({ title, body, groupId });
    }, 600);
    return () => clearTimeout(timer);
  }, [body, closing, dirty, groupId, hasContent, onChange, title]);

  const persist = useCallback(() => {
    onChange({ title, body, groupId });
    setPublished({ title, body, groupId });
  }, [body, groupId, onChange, title]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active' && !closing && dirty && hasContent) {
        persist();
        void store.flush().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [closing, dirty, hasContent, persist, store]);

  const handleSave = useCallback(async () => {
    if (closing) return;
    if (!hasContent) {
      Alert.alert('还没有内容', '标题和正文都是空的，先写点内容再保存。');
      return;
    }
    setClosing(true);
    try {
      persist();
      await store.flush();
      onClose();
    } catch {
      Alert.alert('尚未保存', '保存失败，当前内容仍在编辑器中。请稍后点击保存重试。');
    } finally { setClosing(false); }
  }, [closing, hasContent, onClose, persist, store]);

  // 放弃编辑：新建的直接丢弃，已有的回滚到打开编辑器时的内容。
  const discard = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    try {
      if (isNew) onDiscard();
      else onChange(initialRef.current);
      await store.flush();
      onClose();
    } catch { Alert.alert('操作未完成', '未能保存放弃修改后的内容，请稍后重试。'); }
    finally { setClosing(false); }
  }, [closing, isNew, onChange, onClose, onDiscard, store]);

  const handleBack = useCallback(() => {
    if (closing) return true;
    if (!dirty) {
      // 没有改动：新建的空备忘录直接清掉，已有的直接退出。
      if (isNew) {
        void discard();
      } else {
        onClose();
      }
      return true;
    }
    if (!hasContent) {
      Alert.alert(
        isNew ? '放弃这条备忘录？' : '清空这条备忘录？',
        isNew ? '标题和正文都是空的，返回后不会保存。' : '返回会恢复打开时的内容。',
        [
          { text: '继续编辑', style: 'cancel' },
          { text: '放弃修改', style: 'destructive', onPress: discard },
        ]
      );
      return true;
    }
    Alert.alert(
      '保存这条备忘录？',
      '返回前可以先保存当前内容；选择“不保存”会撤销本次修改。',
      [
        { text: '不保存', style: 'destructive', onPress: discard },
        { text: '保存', onPress: handleSave },
      ]
    );
    return true;
  }, [closing, discard, dirty, handleSave, hasContent, isNew, onClose]);

  // 编辑态优先消费系统返回，避免直接退出应用。
  // 原生 Modal 的返回键由 onRequestClose 接管，所以两个入口都要走 handleBack。
  useBackHandler(handleBack);

  const groupLabel = groupOptions.find((option) => option.id === groupId)?.label ?? '未分类';

  // The bounded native editor owns scrolling. An outer ScrollView competes for
  // drags that start on EditText and can leave the bottom text unreachable.
  return (
    <Modal visible animationType="slide" onRequestClose={handleBack}>
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
          <View style={styles.editorHeader}>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="返回备忘录列表"
              onPress={handleBack}
              hitSlop={12}
              style={styles.backLink}
            >
              <Text style={styles.backLinkText}>‹ 返回</Text>
            </TouchableOpacity>
            <View style={styles.editorHeading}>
              <Text style={styles.editorTitle}>{isNew ? '新建备忘录' : '编辑备忘录'}</Text>
              <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.editorHint}>{
                saveStatus === 'error' ? '保存失败 · 点击保存重试' :
                title !== published.title || body !== published.body || groupId !== published.groupId ? '编辑中 · 稍后自动保存' :
                saveStatus === 'saving' ? '正在保存…' : hasContent ? '已保存到本机' : '输入后自动保存'
              }</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="保存备忘录"
              onPress={handleSave}
              disabled={closing}
              hitSlop={8}
              style={styles.saveButton}
            >
              <Text style={styles.saveButtonText}>{closing ? '保存中…' : '保存'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.editorContent}>
            <TextInput
              accessibilityLabel="备忘录标题"
              placeholder="标题"
              placeholderTextColor={theme.colors.textMuted}
              value={title}
              editable={!closing}
              onChangeText={setTitle}
              style={styles.titleInput}
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="选择分类"
              hitSlop={8}
              onPress={() => setPickerVisible(true)}
              style={styles.groupField}
            >
              <Text style={styles.groupFieldLabel}>分类</Text>
              <Text numberOfLines={1} style={styles.groupFieldValue}>{groupLabel}</Text>
              <Text style={styles.groupFieldLabel}>⌄</Text>
            </TouchableOpacity>

            <TextInput
              ref={bodyRef}
              accessibilityLabel="备忘录正文"
              placeholder="开始记录…"
              placeholderTextColor={theme.colors.textMuted}
              value={body}
              editable={!closing}
              onChangeText={setBody}
              multiline
              onLayout={attachScrolling}
              selection={initialSelection ? { start: 0, end: 0 } : undefined}
              onTouchStart={event => {
                bodyTouch.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, dragged: false };
                setInitialSelection(false);
              }}
              onTouchMove={event => {
                if (Math.abs(event.nativeEvent.pageX - bodyTouch.current.x) + Math.abs(event.nativeEvent.pageY - bodyTouch.current.y) > 8) bodyTouch.current.dragged = true;
              }}
              showSoftInputOnFocus={keyboardRequested}
              onPress={() => { if (!bodyTouch.current.dragged) setKeyboardRequested(true); }}
              textAlignVertical="top"
              style={styles.bodyInput}
            />
          </View>

          <GroupPickerModal
            visible={pickerVisible}
            title="选择分类"
            selectedGroupId={groupId}
            options={groupOptions}
            nullLabel="未分类"
            onClose={() => setPickerVisible(false)}
            onSubmit={(next) => setGroupId(next)}
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}


function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.surface },
    editorHeading: { flex: 1, gap: 3, paddingHorizontal: 8 },
    editorTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary },
    editorHint: { fontSize: 12, color: theme.colors.textSecondary },
    editorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 6,
    },
    backLink: { minHeight: 48, justifyContent: 'center', paddingVertical: 8, paddingRight: 12 },
    backLinkText: { fontSize: 15, fontWeight: '500', color: theme.colors.primaryText },
    saveButton: {
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: theme.radius.small,
      paddingHorizontal: 16,
      paddingVertical: 9,
      backgroundColor: theme.colors.primary,
    },
    saveButtonText: { fontSize: 14, fontWeight: '600', color: theme.colors.onPrimary },
    editorContent: { flex: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
    titleInput: {
      fontSize: 20,
      fontWeight: '500',
      color: theme.colors.textPrimary,
      paddingVertical: 6,
      paddingHorizontal: 0,
    },
    groupField: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      minHeight: 32,
      maxWidth: '100%',
      marginTop: 4,
      marginBottom: 8,
      paddingHorizontal: 12,
      borderRadius: theme.radius.small,
      backgroundColor: theme.colors.surfaceMuted,
    },
    groupFieldLabel: { fontSize: 12, fontWeight: '500', color: theme.colors.textSecondary },
    groupFieldValue: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: theme.colors.primaryText },
    bodyInput: {
      flex: 1,
      minHeight: 0,
      fontSize: 16,
      lineHeight: 25,
      color: theme.colors.textPrimary,
      paddingHorizontal: 0,
      paddingTop: 8,
      paddingBottom: 24,
    },
  });
}
