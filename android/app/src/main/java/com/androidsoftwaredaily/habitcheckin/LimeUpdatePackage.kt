package com.androidsoftwaredaily.habitcheckin

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class LimeUpdatePackage : BaseReactPackage() {
  override fun getModule(name: String, context: ReactApplicationContext): NativeModule? =
    if (name == LimeUpdateModule.NAME) LimeUpdateModule(context) else null
  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(LimeUpdateModule.NAME to ReactModuleInfo(LimeUpdateModule.NAME, LimeUpdateModule::class.java.name, false, false, false, true))
  }
}
