package com.androidsoftwaredaily.habitcheckin

import android.widget.EditText
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.UIManagerHelper

@ReactModule(name = MemoScrollModule.NAME)
class MemoScrollModule(private val context: ReactApplicationContext) : NativeMemoScrollSpec(context), LifecycleEventListener {
  private val controllers = mutableMapOf<Int, MemoScrollController>()
  init { context.addLifecycleEventListener(this) }
  override fun getName() = NAME

  override fun attach(viewTag: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val tag = viewTag.toInt()
        val editor = UIManagerHelper.getUIManagerForReactTag(context, tag)?.resolveView(tag) as? EditText
            ?: error("Memo input is not mounted")
        controllers.remove(tag)?.close()
        controllers[tag] = MemoScrollController(editor)
        promise.resolve(true)
      } catch (error: Exception) { promise.reject("E_MEMO_SCROLL", "Unable to attach native memo scrolling", error) }
    }
  }
  override fun detach(viewTag: Double) {
    UiThreadUtil.runOnUiThread { controllers.remove(viewTag.toInt())?.close() }
  }
  override fun onHostPause() { UiThreadUtil.runOnUiThread { controllers.values.forEach { it.stop() } } }
  override fun onHostResume() = Unit
  override fun onHostDestroy() { UiThreadUtil.runOnUiThread { controllers.values.forEach { it.close() }; controllers.clear() } }
  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    onHostDestroy()
    super.invalidate()
  }
  companion object { const val NAME = "NativeMemoScroll" }
}
