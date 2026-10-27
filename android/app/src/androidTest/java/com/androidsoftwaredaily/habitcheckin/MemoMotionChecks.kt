package com.androidsoftwaredaily.habitcheckin

import android.app.Instrumentation
import android.content.Intent
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.content.Context
import android.view.ViewGroup
import android.view.inspector.WindowInspector
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.EditText
import org.json.JSONObject

/** Real pointer events against the shipped RN memo field; samples native position after release. */
internal class MemoMotionChecks(private val instrumentation: Instrumentation) {
  private lateinit var editor: EditText
  private fun <T> ui(block: () -> T): T {
    var value: T? = null
    var failure: Throwable? = null
    instrumentation.runOnMainSync { try { value = block() } catch (error: Throwable) { failure = error } }
    failure?.let { throw it }
    @Suppress("UNCHECKED_CAST") return value as T
  }
  private fun click(label: String) {
    fun find(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
      if (node == null) return null
      if (node.contentDescription?.toString() == label) return node
      for (i in 0 until node.childCount) find(node.getChild(i))?.let { return it }
      return null
    }
    val deadline = SystemClock.uptimeMillis() + 15000
    while (SystemClock.uptimeMillis() < deadline) {
      val node = find(instrumentation.uiAutomation.rootInActiveWindow)
      if (node != null && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { SystemClock.sleep(500); return }
      SystemClock.sleep(200)
    }
    error("Missing accessible action: $label")
  }
  private fun position() = ui { editor.scrollY }
  private fun point(): FloatArray = ui {
    val location = IntArray(2)
    editor.getLocationOnScreen(location)
    floatArrayOf(location[0] + editor.width * .5f, location[1] + editor.height * .7f,
        editor.height * .4f)
  }
  private fun event(action: Int, x: Float, y: Float, down: Long) {
    val event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0)
    instrumentation.sendPointerSync(event)
    event.recycle()
  }
  private fun swipe(reverse: Boolean = false, hold: Boolean = false): Int {
    val p = point()
    val y = if (reverse) p[1] - p[2] else p[1]
    val distance = if (reverse) p[2] else -p[2]
    val down = SystemClock.uptimeMillis()
    event(MotionEvent.ACTION_DOWN, p[0], y, down)
    for (i in 1..10) {
      SystemClock.sleep(16)
      event(MotionEvent.ACTION_MOVE, p[0], y + distance * i / 10f, down)
    }
    if (hold) SystemClock.sleep(250)
    val beforeUp = position()
    event(MotionEvent.ACTION_UP, p[0], y + distance, down)
    return beforeUp
  }
  fun run(): String {
    instrumentation.startActivitySync(Intent(instrumentation.targetContext, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    SystemClock.sleep(2200)
    click("备忘录")
    click("打开 长文滑动验收")
    fun find(view: View): EditText? {
      if (view is EditText && view.contentDescription?.toString() == "备忘录正文") return view
      if (view is ViewGroup) for (i in 0 until view.childCount) find(view.getChildAt(i))?.let { return it }
      return null
    }
    SystemClock.sleep(800)
    editor = ui { WindowInspector.getGlobalWindowViews().firstNotNullOfOrNull(::find) }
      ?: error("Missing actual memo editor")
    val result = JSONObject()
    fun reset() { ui { editor.setSelection(0); editor.scrollTo(0, 200) }; SystemClock.sleep(80) }
    swipe(hold = true) // Release the initial controlled selection before measuring either build.
    reset()
    val release = swipe()
    SystemClock.sleep(100)
    val after100 = position()
    SystemClock.sleep(120)
    val after220 = position()
    check(after100 > release + 10 && after220 > after100) { "No momentum: $release/$after100/$after220" }
    result.put("fling", JSONObject().put("releaseY", release).put("after100msY", after100).put("after220msY", after220))
    val p = point()
    val down = SystemClock.uptimeMillis()
    event(MotionEvent.ACTION_DOWN, p[0], p[1], down)
    val stopped = position()
    SystemClock.sleep(150)
    check(kotlin.math.abs(position() - stopped) <= 2) { "Touch did not stop momentum" }
    event(MotionEvent.ACTION_CANCEL, p[0], p[1], down)
    result.put("touchBrakes", true)
    val reverseRelease = swipe(reverse = true)
    SystemClock.sleep(160)
    check(position() < reverseRelease - 10) { "Reverse swipe did not fling backwards" }
    result.put("reverseFling", true)
    reset()
    val slowRelease = swipe(hold = true)
    SystemClock.sleep(180)
    check(kotlin.math.abs(position() - slowRelease) <= 2) { "Held release unexpectedly flung" }
    result.put("heldReleaseHasNoMomentum", true)
    reset()
    ui { editor.setSelection(0, 5) }
    val selectedRelease = swipe()
    SystemClock.sleep(180)
    check(kotlin.math.abs(position() - selectedRelease) <= 2) { "Selection drag unexpectedly flung" }
    result.put("selectionDragHasNoMomentum", true)
    reset()
    val closedHeight = ui { editor.height }
    val tap = point()
    val tapDown = SystemClock.uptimeMillis()
    event(MotionEvent.ACTION_DOWN, tap[0], tap[1], tapDown)
    SystemClock.sleep(50)
    event(MotionEvent.ACTION_UP, tap[0], tap[1], tapDown)
    SystemClock.sleep(1000)
    check(ui { editor.height } < closedHeight - 100) { "Software keyboard did not resize the memo viewport" }
    reset()
    val openRelease = swipe()
    SystemClock.sleep(100)
    val open100 = position()
    SystemClock.sleep(120)
    val open220 = position()
    check(open100 > openRelease + 10 && open220 > open100) { "No momentum with IME: $openRelease/$open100/$open220" }
    result.put("keyboardOpenFling", JSONObject().put("releaseY", openRelease).put("after100msY", open100).put("after220msY", open220))
    ui { (editor.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
        .hideSoftInputFromWindow(editor.windowToken, 0) }
    SystemClock.sleep(900)
    val resized = position()
    SystemClock.sleep(150)
    check(kotlin.math.abs(position() - resized) <= 2) { "Resize did not stop momentum" }
    result.put("keyboardResizeStopsMomentum", true)
    return result.toString()
  }
}
