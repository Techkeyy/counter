package app.counter.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

/**
 * A deliberately short-lived foreground window around a wallet handoff.
 *
 * This is not a background worker and does not perform wallet or economic
 * actions. It keeps the Counter process and MWA association available while
 * the user is in Phantom. Persisted JS recovery remains authoritative if the
 * OS still recreates the process.
 */
class WalletKeepaliveService : Service() {
  companion object {
    const val ACTION_START = "app.counter.mobile.action.WALLET_KEEPALIVE_START"
    const val ACTION_STOP = "app.counter.mobile.action.WALLET_KEEPALIVE_STOP"
    const val EXTRA_OPERATION_TYPE = "operation_type"
    const val CHANNEL_ID = "counter_wallet_handoff"
    const val NOTIFICATION_ID = 4107
    private const val MAX_WINDOW_MS = 90_000L
  }

  private val handler = Handler(Looper.getMainLooper())
  private var generation = 0L
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopKeepalive()
      stopSelfResult(startId)
      return START_NOT_STICKY
    }
    if (intent?.action != ACTION_START) return START_NOT_STICKY

    val operationType = intent.getStringExtra(EXTRA_OPERATION_TYPE) ?: "wallet"
    val currentGeneration = ++generation
    val notification = buildNotification(operationType)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    acquireWakeLock()
    handler.postDelayed({
      if (generation == currentGeneration) stopSelf()
    }, MAX_WINDOW_MS)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopKeepalive()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        "Wallet handoff",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Short-lived Counter wallet handoff status"
        setShowBadge(false)
        setSound(null, null)
      },
    )
  }

  private fun buildNotification(operationType: String): Notification {
    val message = if (operationType == "CONNECT") {
      "Connecting securely to your wallet…"
    } else {
      "Waiting for wallet approval…"
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
    return builder
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle("Counter")
      .setContentText(message)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setColor(Color.rgb(255, 91, 77))
      .setCategory(Notification.CATEGORY_SERVICE)
      .build()
  }

  private fun acquireWakeLock() {
    val manager = getSystemService(POWER_SERVICE) as PowerManager
    if (wakeLock == null) {
      wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Counter:WalletHandoff")
    }
    if (wakeLock?.isHeld != true) wakeLock?.acquire(MAX_WINDOW_MS)
  }

  private fun stopKeepalive() {
    generation += 1
    handler.removeCallbacksAndMessages(null)
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
    else @Suppress("DEPRECATION") stopForeground(true)
  }
}
