package com.androidsoftwaredaily.habitcheckin

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class MemoScrollPackage : BaseReactPackage() {
  override fun getModule(name: String, context: ReactApplicationContext): NativeModule? =
    if (name == MemoScrollModule.NAME) MemoScrollModule(context) else null
  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(MemoScrollModule.NAME to ReactModuleInfo(MemoScrollModule.NAME, MemoScrollModule::class.java.name, false, false, false, true))
  }
}
