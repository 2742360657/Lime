package app.lime.personalassistant

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

// Debug only, synthetic fixture directory only. Never exposes ordinary app files.
class MaterialFixtureProvider : ContentProvider() {
  override fun onCreate() = true
  private fun fixture(uri: Uri): File {
    val name = uri.lastPathSegment ?: error("Missing fixture")
    require(name.matches(Regex("synthetic-[a-z0-9.-]+")))
    return File(context!!.cacheDir, "p3-fixtures/$name")
  }
  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor { require(mode == "r"); return ParcelFileDescriptor.open(fixture(uri), ParcelFileDescriptor.MODE_READ_ONLY) }
  override fun getType(uri: Uri): String = when (fixture(uri).extension) { "pdf" -> "application/pdf"; "png" -> "image/png"; else -> "text/plain" }
  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
    val file = fixture(uri)
    return MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)).apply { addRow(arrayOf<Any?>(file.name, if (file.extension == "dat") null else file.length())) }
  }
  override fun insert(uri: Uri, values: ContentValues?): Uri? = null
  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
}
