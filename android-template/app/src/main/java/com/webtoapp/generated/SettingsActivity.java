package com.webtoapp.generated;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.Switch;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class SettingsActivity extends AppCompatActivity {
    private static final int REQ = 2001;
    private Switch swCam, swMic, swLoc, swNoti, swStore;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        swCam = findViewById(R.id.switch_camera);
        swMic = findViewById(R.id.switch_mic);
        swLoc = findViewById(R.id.switch_location);
        swNoti = findViewById(R.id.switch_notifications);
        swStore = findViewById(R.id.switch_storage);

        bind(swCam, new String[]{Manifest.permission.CAMERA});
        bind(swMic, new String[]{Manifest.permission.RECORD_AUDIO});
        bind(swLoc, new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION});
        bindNotifications(swNoti);
        String[] storePerms = Build.VERSION.SDK_INT >= 33
            ? new String[]{Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO}
            : new String[]{Manifest.permission.READ_EXTERNAL_STORAGE};
        bind(swStore, storePerms);

        Button open = findViewById(R.id.open_system_settings);
        open.setOnClickListener(v -> openAppSettings());

        Button close = findViewById(R.id.close_settings);
        close.setOnClickListener(v -> finish());
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStates();
    }

    private void refreshStates() {
        setChecked(swCam, hasPerm(Manifest.permission.CAMERA));
        setChecked(swMic, hasPerm(Manifest.permission.RECORD_AUDIO));
        setChecked(swLoc, hasPerm(Manifest.permission.ACCESS_FINE_LOCATION));
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        boolean notiOn = nm != null && nm.areNotificationsEnabled();
        setChecked(swNoti, notiOn);
        if (Build.VERSION.SDK_INT >= 33) {
            setChecked(swStore, hasPerm(Manifest.permission.READ_MEDIA_IMAGES));
        } else {
            setChecked(swStore, hasPerm(Manifest.permission.READ_EXTERNAL_STORAGE));
        }
    }

    private void setChecked(Switch s, boolean v) {
        s.setOnCheckedChangeListener(null);
        s.setChecked(v);
        rebindListener(s);
    }

    private void rebindListener(Switch s) {
        if (s == swCam) bind(swCam, new String[]{Manifest.permission.CAMERA});
        else if (s == swMic) bind(swMic, new String[]{Manifest.permission.RECORD_AUDIO});
        else if (s == swLoc) bind(swLoc, new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION});
        else if (s == swNoti) bindNotifications(swNoti);
        else if (s == swStore) {
            String[] storePerms = Build.VERSION.SDK_INT >= 33
                ? new String[]{Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_AUDIO}
                : new String[]{Manifest.permission.READ_EXTERNAL_STORAGE};
            bind(swStore, storePerms);
        }
    }

    private void bind(Switch sw, String[] perms) {
        sw.setOnCheckedChangeListener((CompoundButton b, boolean checked) -> {
            if (checked) {
                boolean missing = false;
                for (String p : perms) if (!hasPerm(p)) { missing = true; break; }
                if (missing) ActivityCompat.requestPermissions(this, perms, REQ);
            } else {
                Toast.makeText(this, "لإلغاء الإذن، استخدم إعدادات النظام", Toast.LENGTH_SHORT).show();
                openAppSettings();
            }
        });
    }

    private void bindNotifications(Switch sw) {
        sw.setOnCheckedChangeListener((CompoundButton b, boolean checked) -> {
            if (Build.VERSION.SDK_INT >= 33 && checked && !hasPerm("android.permission.POST_NOTIFICATIONS")) {
                ActivityCompat.requestPermissions(this, new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ);
            } else {
                Intent i = new Intent();
                if (Build.VERSION.SDK_INT >= 26) {
                    i.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                } else {
                    i.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    i.setData(Uri.parse("package:" + getPackageName()));
                }
                startActivity(i);
            }
        });
    }

    private boolean hasPerm(String p) {
        return ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED;
    }

    private void openAppSettings() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(Uri.parse("package:" + getPackageName()));
        startActivity(i);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        refreshStates();
    }
}
