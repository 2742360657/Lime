package app.lime.personalassistant

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Bundle

// Debug-only system intent sender. URI values are hard-coded synthetic fixtures.
class MaterialFixtureSender : Activity() {
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    val base = "content://${packageName}.fixtures/"
    val text = Uri.parse(base + "synthetic-text.txt")
    val image = Uri.parse(base + "synthetic-image.png")
    val outgoing = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
      type = "*/*"
      putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(text, image))
      clipData = ClipData.newUri(contentResolver, "Synthetic files", text).apply { addItem(ClipData.Item(image)) }
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      setClass(this@MaterialFixtureSender, MainActivity::class.java)
    }
    startActivity(outgoing)
    finish()
  }
}
