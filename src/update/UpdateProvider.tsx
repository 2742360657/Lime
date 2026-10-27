import * as FileSystem from 'expo-file-system/legacy';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import NativeUpdater, { type InstalledInfo } from '../native/NativeLimeUpdater';
import { useAppActions, useAppSelector, useSettings } from '../state/AppProvider';
import { fetchManifest, RELEASE_PAGE, selectUpdate, shouldAutoCheck } from './manifest';
import { UpdateDialog } from './UpdateDialog';

export type UpdateCandidate = NonNullable<ReturnType<typeof selectUpdate>>;
export type UpdateStage = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
type UpdateContextValue = {
  installed: InstalledInfo | null; stage: UpdateStage; message: string; candidate: UpdateCandidate | null;
  checkNow: () => void; showUpdate: () => void; openReleasePage: () => void;
};
const UpdateContext = createContext<UpdateContextValue | null>(null);
export function useAppUpdate() {
  const value = useContext(UpdateContext);
  if (!value) throw new Error('UpdateProvider is missing');
  return value;
}

export function UpdateProvider({ children }: PropsWithChildren) {
  const isHydrated = useAppSelector(s => s.isHydrated);
  const { settings } = useSettings();
  const { setUpdatePreferences } = useAppActions();
  const [installed, setInstalled] = useState<InstalledInfo | null>(null);
  const [stage, setStageState] = useState<UpdateStage>('idle');
  const [message, setMessage] = useState('');
  const [candidate, setCandidate] = useState<UpdateCandidate | null>(null);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const stageRef = useRef<UpdateStage>('idle');
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const installedRef = useRef<InstalledInfo | null>(null);
  const candidateRef = useRef<UpdateCandidate | null>(null);
  const fileRef = useRef<string | null>(null);
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);
  const attempt = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const automaticRequest = useRef(false);
  const cancelling = useRef(false);
  const setStage = useCallback((value: UpdateStage) => { stageRef.current = value; setStageState(value); }, []);

  useEffect(() => {
    let active = true;
    NativeUpdater.getInstalledInfo().then(info => {
      if (active) { installedRef.current = info; setInstalled(info); }
    }).catch(() => { if (active) setMessage('无法读取安装包信息，可打开发布页手动更新。'); });
    return () => { active = false; requestRef.current?.abort(); };
  }, []);

  const check = useCallback(async (manual: boolean) => {
    const info = installedRef.current;
    if (!info || ['checking', 'downloading', 'installing', 'ready'].includes(stageRef.current)) return;
    if (!manual && !shouldAutoCheck(settingsRef.current.autoCheckUpdates, settingsRef.current.lastUpdateCheckAt)) return;
    const controller = new AbortController();
    requestRef.current = controller;
    automaticRequest.current = !manual;
    const timer = setTimeout(() => controller.abort(), 15_000);
    setStage('checking'); setMessage('正在检查更新…');
    setUpdatePreferences({ lastUpdateCheckAt: Date.now() });
    try {
      const result = selectUpdate(await fetchManifest(controller.signal), info);
      if (!manual && !settingsRef.current.autoCheckUpdates) { setStage('idle'); setMessage(''); return; }
      if (!result || (!manual && result.manifest.versionCode === settingsRef.current.skippedUpdateVersionCode)) {
        candidateRef.current = null; setCandidate(null); setStage('idle');
        setMessage(manual ? '当前已是最新版本' : ''); return;
      }
      candidateRef.current = result; setCandidate(result); setStage('available');
      setMessage(`发现新版本 ${result.manifest.version}`); setVisible(true);
    } catch (error) {
      setStage('idle');
      setMessage(manual ? (error instanceof Error && error.name === 'AbortError' ? '检查超时，请稍后重试。' : error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : '暂时无法连接更新源，请检查网络或稍后重试。') : '');
    } finally { clearTimeout(timer); requestRef.current = null; automaticRequest.current = false; }
  }, [setStage, setUpdatePreferences]);

  useEffect(() => {
    if (!settings.autoCheckUpdates && automaticRequest.current) requestRef.current?.abort();
    if (isHydrated && installed && stageRef.current !== 'available') void check(false);
  }, [isHydrated, installed, settings.autoCheckUpdates, settings.lastUpdateCheckAt, check]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      if (isHydrated && stageRef.current !== 'available') void check(false);
      if (stageRef.current === 'ready' && fileRef.current) {
        NativeUpdater.canInstallPackages().then(allowed => { if (allowed) setMessage('已允许安装，可继续安装更新。'); }).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [check, isHydrated]);

  const cancelDownload = useCallback(async () => {
    if (cancelling.current || stageRef.current !== 'downloading') return;
    cancelling.current = true;
    attempt.current += 1;
    const active = downloadRef.current; downloadRef.current = null;
    const uri = fileRef.current; fileRef.current = null;
    try { await active?.pauseAsync(); } catch { /* A completed request may already be closed. */ }
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    cancelling.current = false;
    setProgress(0); setStage('available'); setMessage('下载已取消，可以稍后重试。');
  }, [setStage]);

  const download = useCallback(async () => {
    const release = candidateRef.current; const info = installedRef.current;
    if (!release || !info || cancelling.current || ['downloading', 'installing'].includes(stageRef.current)) return;
    const id = ++attempt.current;
    const directory = info.updateDirectoryUri;
    const uri = directory + release.asset.name;
    setStage('downloading'); setProgress(0); setMessage('正在下载更新…'); fileRef.current = uri;
    try {
      await FileSystem.deleteAsync(directory, { idempotent: true });
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      if (id !== attempt.current) return;
      const task = FileSystem.createDownloadResumable(release.asset.url, uri, {}, event => {
        if (id === attempt.current) setProgress(Math.min(1, event.totalBytesWritten / release.asset.size));
      });
      downloadRef.current = task;
      const result = await task.downloadAsync();
      if (id !== attempt.current) return;
      if (!result || result.status !== 200) throw new Error('下载未完成，请检查网络后重试。');
      setProgress(1); setMessage('正在校验安装包…');
      await NativeUpdater.verifyApk(uri, release.asset.sha256, release.manifest.versionCode, release.manifest.version, release.asset.size);
      if (id !== attempt.current) return;
      setStage('ready'); setMessage('安装包已完成校验，可以安装更新。');
    } catch (error) {
      if (id !== attempt.current) return;
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      fileRef.current = null; setStage('error'); setMessage(error instanceof Error ? error.message : '下载失败，请重试。');
    } finally { if (id === attempt.current) downloadRef.current = null; }
  }, [setStage]);

  const install = useCallback(async () => {
    const release = candidateRef.current; const uri = fileRef.current;
    if (!release || !uri || stageRef.current !== 'ready') return;
    setStage('installing'); setMessage('正在打开系统安装界面…');
    try {
      // Native code verifies the file again immediately before granting read access.
      const result = await NativeUpdater.installApk(uri, release.asset.sha256, release.manifest.versionCode, release.manifest.version, release.asset.size);
      setStage('ready'); setMessage(result === 'permission' ? '请允许来自酸橙的安装，返回后再次点击安装更新。' : '请在系统安装界面确认更新。');
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'E_UPDATE_INSTALL' || code === 'E_UPDATE_ACTIVITY') setStage('ready');
      else { fileRef.current = null; setStage('error'); }
      setMessage(error instanceof Error ? error.message : '安装未能开始，请重试。');
    }
  }, [setStage]);

  const close = useCallback(() => {
    setVisible(false);
    if (stageRef.current === 'downloading') void cancelDownload();
  }, [cancelDownload]);
  const skip = useCallback(() => {
    if (candidateRef.current) setUpdatePreferences({ skippedUpdateVersionCode: candidateRef.current.manifest.versionCode });
    setVisible(false); setStage('idle'); setMessage('已跳过此版本，仍可手动检查更新。');
  }, [setStage, setUpdatePreferences]);
  const openReleasePage = useCallback(() => {
    const tag = candidateRef.current?.manifest.tag;
    void Linking.openURL(tag ? `https://github.com/2742360657/Lime/releases/tag/${tag}` : RELEASE_PAGE).catch(() => setMessage('无法打开浏览器，请检查系统默认浏览器设置。'));
  }, []);

  return <UpdateContext.Provider value={{ installed, stage, message, candidate, checkNow: () => { void check(true); }, showUpdate: () => setVisible(true), openReleasePage }}>
    {children}
    <UpdateDialog visible={visible} candidate={candidate} stage={stage} message={message} progress={progress} onClose={close} onSkip={skip} onDownload={() => { void download(); }} onCancel={() => { void cancelDownload(); }} onInstall={() => { void install(); }} onReleasePage={openReleasePage} />
  </UpdateContext.Provider>;
}
