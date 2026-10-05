package app.counter.mobile

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WalletKeepaliveModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "CounterWalletKeepalive"

  @ReactMethod
  fun start(operationType: String, operationId: String, promise: Promise) {
    try {
      val intent = Intent(reactContext, WalletKeepaliveService::class.java).apply {
        action = WalletKeepaliveService.ACTION_START
        putExtra(WalletKeepaliveService.EXTRA_OPERATION_TYPE, operationType)
        // The operation id is intentionally not rendered or logged by the
        // service; it only makes the native boundary explicit for debugging.
        putExtra("operation_id", operationId)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(true)
    } catch (_: Throwable) {
      // JS recovery remains authoritative if a device refuses the optional
      // native keepalive. Do not expose platform exception text to the user.
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val intent = Intent(reactContext, WalletKeepaliveService::class.java).apply {
        action = WalletKeepaliveService.ACTION_STOP
      }
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (_: Throwable) {
      promise.resolve(false)
    }
  }
}
