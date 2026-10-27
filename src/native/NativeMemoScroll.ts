import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  attach(viewTag: number): Promise<boolean>;
  detach(viewTag: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeMemoScroll');
