import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type InstalledInfo = {
  applicationId: string;
  version: string;
  versionCode: number;
  sdk: number;
  supportedAbis: Array<string>;
  certificateSha256: string;
  updateDirectoryUri: string;
};

export interface Spec extends TurboModule {
  getInstalledInfo(): Promise<InstalledInfo>;
  verifyApk(uri: string, sha256: string, versionCode: number, version: string, size: number): Promise<boolean>;
  installApk(uri: string, sha256: string, versionCode: number, version: string, size: number): Promise<string>;
  canInstallPackages(): Promise<boolean>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeLimeUpdater');
