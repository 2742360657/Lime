package com.androidsoftwaredaily.habitcheckin

import android.text.Editable
import android.text.TextWatcher
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.widget.EditText
import android.widget.OverScroller
import kotlin.math.abs
import kotlin.math.max

/** Adds fling to the existing editor; native EditText still owns drag, caret, IME and selection. */
internal class MemoScrollController(private val editor: EditText) : View.OnTouchListener,
    View.OnAttachStateChangeListener, TextWatcher {
  private val configuration = ViewConfiguration.get(editor.context)
  private val scroller = OverScroller(editor.context)
  private var tracker: VelocityTracker? = null
  private var downX = 0f
  private var downY = 0f
  private var downScroll = 0
  private var dragging = false
  private var suppressed = false
  private var scrolled = false
  private var closed = false
  private var pendingFling: Runnable? = null
  private val layoutListener = View.OnLayoutChangeListener { _, l, t, r, b, ol, ot, or, ob ->
    if (r - l != or - ol || b - t != ob - ot) stop()
  }
  private val frame = object : Runnable {
    override fun run() {
      if (closed || !editor.isShown || editor.hasSelection() || !scroller.computeScrollOffset()) {
        stop()
        return
      }
      val y = scroller.currY.coerceIn(0, maxScroll())
      editor.scrollTo(editor.scrollX, y)
      if (y != scroller.currY) stop() else editor.postOnAnimation(this)
    }
  }

  init {
    editor.setOnTouchListener(this)
    editor.addOnAttachStateChangeListener(this)
    editor.addOnLayoutChangeListener(layoutListener)
    editor.addTextChangedListener(this)
  }

  private fun maxScroll() = max(0, (editor.layout?.height ?: 0) -
      (editor.height - editor.totalPaddingTop - editor.totalPaddingBottom))

  fun stop() {
    pendingFling?.let(editor::removeCallbacks)
    pendingFling = null
    editor.removeCallbacks(frame)
    scroller.forceFinished(true)
  }

  override fun onTouch(view: View, event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        stop()
        tracker?.recycle()
        tracker = VelocityTracker.obtain().also { it.addMovement(event) }
        downX = event.x
        downY = event.y
        downScroll = editor.scrollY
        dragging = false
        scrolled = false
        suppressed = editor.hasSelection()
      }
      MotionEvent.ACTION_POINTER_DOWN -> { suppressed = true; stop() }
      MotionEvent.ACTION_MOVE -> {
        tracker?.addMovement(event)
        if (!dragging && abs(event.y - downY) > configuration.scaledTouchSlop &&
            abs(event.y - downY) > abs(event.x - downX)) {
          dragging = true
          // A long press or a selection-handle drag belongs to the platform editor.
          if (event.eventTime - event.downTime >= ViewConfiguration.getLongPressTimeout()) suppressed = true
        }
        scrolled = scrolled || editor.scrollY != downScroll
      }
      MotionEvent.ACTION_UP -> {
        tracker?.let { velocity ->
          velocity.addMovement(event)
          velocity.computeCurrentVelocity(1000, configuration.scaledMaximumFlingVelocity.toFloat())
          val speed = -velocity.yVelocity.toInt()
          if (!suppressed && dragging && (scrolled || editor.scrollY != downScroll) &&
              abs(speed) >= configuration.scaledMinimumFlingVelocity) {
            // Let EditText finish its ACTION_UP first. No text/selection mutation is needed.
            pendingFling = Runnable {
              pendingFling = null
              if (!closed && editor.isShown && !editor.hasSelection()) {
                scroller.fling(editor.scrollX, editor.scrollY, 0, speed, editor.scrollX,
                    editor.scrollX, 0, maxScroll())
                editor.postOnAnimation(frame)
              }
            }.also(editor::postOnAnimation)
          }
        }
        tracker?.recycle()
        tracker = null
      }
      MotionEvent.ACTION_CANCEL -> { stop(); tracker?.recycle(); tracker = null }
    }
    // Observing rather than consuming preserves Android's own text interaction.
    return false
  }

  fun close() {
    if (closed) return
    closed = true
    stop()
    tracker?.recycle()
    tracker = null
    editor.setOnTouchListener(null)
    editor.removeOnAttachStateChangeListener(this)
    editor.removeOnLayoutChangeListener(layoutListener)
    editor.removeTextChangedListener(this)
  }
  override fun onViewAttachedToWindow(view: View) = Unit
  override fun onViewDetachedFromWindow(view: View) = close()
  override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) = stop()
  override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) = Unit
  override fun afterTextChanged(text: Editable?) = Unit
}
