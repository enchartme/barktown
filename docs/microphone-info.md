Here is goblinpi status JSON output example
It is accessible on tailnet
endpoint: https://goblinpi.tail523149.ts.net/status

```
{"alive":true,"audio":{"clip_rate_10s":0.0,"peak_now":0.0013,"rms_dbfs_mean_10s":-63.4,"rms_dbfs_now":-68.3,"rms_mean_10s":0.0007,"rms_now":0.0004,"sample_rate":48000,"streaming":true,"usb_mic_present":true,"xruns_last_hour":0},"boot_time":"2026-06-05T19:49:57Z","counts_24h":{"bark_candidates":0,"bark_events":0,"evidence_clips":0,"uploads_failed":0,"uploads_ok":0,"uploads_retried":0},"cpu":{"percent_1s":0.0,"percent_peak_60s":100.0,"temp_c":52.1,"throttled_bits":"0x50000"},"disk":{"sd_free_mb":9104.7},"heartbeat_seq":20,"net":{"last_upload_probe":"2026-06-05T20:09:11.901136Z","local_ip":"192.168.1.151","masmopi_ok":true,"online":true,"tailscale_ip":"100.72.156.21"},"now":"2026-06-05T20:09:11.611627Z","pipeline":{"last_inference_ts":null,"model_version":null,"state":"IDLE"},"ram":{"peak_60s_mb":286.2,"used_mb":258.3},"uptime_s":1154}
```



Raw numbers are useless until they get a legend. Very human of audio to hide meaning behind decimals.

Use this cheat sheet for your current **status metrics**.

## First: which values are linear vs log

* **`rms_now`**: **linear**
* **`rms_mean_10s`**: **linear**
* **`peak_now`**: **linear**
* **`clip_rate_10s`**: **linear**
* **`xruns_last_hour`**: **linear count**
* **`sample_rate`**: **linear**
* **`rms_dbfs_now`**: **log**
* **`rms_dbfs_mean_10s`**: **log**

### Important intuition

For the **linear** amplitude values (`rms_*`, `peak_now`):

* `0.02` vs `0.04` = **2x amplitude**
* power/energy is roughly proportional to amplitude squared, so that is about **4x energy**

For the **dBFS** values:

* `-20 dBFS` vs `-40 dBFS` is **not 2x**
* difference of **20 dB** means about **10x amplitude**
* difference of **6 dB** is about **2x amplitude**
* difference of **3 dB** is about **1.41x amplitude**

So:

* linear numbers tell you direct waveform size
* dB numbers tell you perceived level more usefully

## Benchmarks

### `rms_now`

Current short-window signal energy, **linear**, roughly 0 to 1.

* **way too low**: `< 0.003`
* **too low**: `0.003 to 0.01`
* **in range**: `0.01 to 0.08`
* **too high**: `0.08 to 0.2`
* **way too high**: `> 0.2`

Interpretation:

* very low = near silence / dead input / too little gain
* good range = healthy ambient / ordinary events
* too high = loud environment or too much gain
* way too high = likely ugly, may approach clipping on peaks

---

### `rms_mean_10s`

Average energy over 10 seconds, **linear**.

* **way too low**: `< 0.002`
* **too low**: `0.002 to 0.008`
* **in range**: `0.008 to 0.05`
* **too high**: `0.05 to 0.12`
* **way too high**: `> 0.12`

Interpretation:

* this is your ambient baseline metric
* if this climbs a lot outdoors, you’re getting wind / traffic / broad noise contamination

---

### `rms_dbfs_now`

Current short-window energy in **dBFS**, **log**.
Closer to `0` is louder. More negative is quieter.

* **way too low**: `< -50 dBFS`
* **too low**: `-50 to -35 dBFS`
* **in range**: `-35 to -18 dBFS`
* **too high**: `-18 to -10 dBFS`
* **way too high**: `> -10 dBFS`

Interpretation:

* around `-30 dBFS` to `-20 dBFS` is usually a healthy live signal for diagnostics
* above `-10 dBFS` sustained means the input is getting pretty hot

---

### `rms_dbfs_mean_10s`

Average 10-second energy in **dBFS**, **log**.

* **way too low**: `< -55 dBFS`
* **too low**: `-55 to -40 dBFS`
* **in range**: `-40 to -22 dBFS`
* **too high**: `-22 to -14 dBFS`
* **way too high**: `> -14 dBFS`

Interpretation:

* very good for comparing setups
* this is one of your best “is the environment / shield / gain sane?” metrics

---

### `peak_now`

Highest absolute sample in recent block, **linear**, 0 to 1.

* **way too low**: `< 0.02`
* **too low**: `0.02 to 0.08`
* **in range**: `0.08 to 0.5`
* **too high**: `0.5 to 0.85`
* **way too high**: `> 0.85`

Interpretation:

* if `peak_now` is huge but RMS is modest, you may have transient hits, clicks, claps
* if `peak_now` lives near `1.0`, clipping is lurking

---

### `clip_rate_10s`

Fraction of samples near digital full-scale, **linear**.

* **way too low**: `0.0` is actually **good**
* **too low**: not applicable
* **in range**: `0.0 to 0.00001`
* **too high**: `0.00001 to 0.001`
* **way too high**: `> 0.001`

Interpretation:

* this should ideally stay **zero**
* even small nonzero values deserve attention
* if this rises during wind gusts or barking, gain is too hot or the mic/chain is saturating

For intuition:

* `0.001` means about **0.1%** of samples clipped
* that is already pretty bad in a diagnostic system

---

### `xruns_last_hour`

Count of buffer overruns, **linear count**.

* **way too low**: `0` is **perfect**
* **too low**: not applicable
* **in range**: `0`
* **too high**: `1 to 5`
* **way too high**: `> 5`

Interpretation:

* target is **always 0**
* any nonzero value means dropped or mishandled real-time audio
* occasional single xrun during restart is survivable
* repeated xruns mean your buffer / callback / CPU / I/O setup is not stable

---

### `sample_rate`

Samples per second, **linear**.

This is not really “too low / too high” in the same way, but for your use case:

* **way too low**: `< 8000`
* **too low**: `8000`
* **in range**: `16000 to 48000`
* **too high**: `96000`
* **way too high**: `> 96000`

Interpretation:

* **16 kHz** is enough for bark detection
* **48 kHz** is great for diagnostics and capture experiments
* higher than that is mostly waste on a Pi 3B+

---

### `usb_mic_present`

Boolean, not linear or log.

* `false` = bad
* `true` = good

---

### `streaming`

Boolean, not linear or log.

* `false` = stream not open or failed
* `true` = stream alive

## Your current values

From what you showed:

* `clip_rate_10s = 0.0` → **excellent**
* `peak_now = 0.1296` → **healthy**
* `rms_dbfs_mean_10s = -28.9` → **good**
* `rms_dbfs_now = -24.5` → **good**
* `rms_mean_10s = 0.0358` → **good**
* `rms_now = 0.0594` → **good**
* `xruns_last_hour = 0` → **excellent**

So your current setup looks **healthy and conservative**, not too quiet, not too hot.

## Practical rule of thumb

For this bark project, the target vibe is:

* **`xruns_last_hour = 0`**
* **`clip_rate_10s = 0.0`**
* **`peak_now` usually below `0.5`**
* **`rms_dbfs_mean_10s` roughly between `-40` and `-20 dBFS`**
* **`rms_dbfs_now` not living above `-12 dBFS`**

That gives you a robust signal without cooking it.

## One more useful mental shortcut

For dB values:

* `-40 dBFS` = much quieter than `-20 dBFS`
* `-20 dBFS` is **10x amplitude** above `-40 dBFS`
* `-14 dBFS` is about **2x amplitude** above `-20 dBFS`
* `-8 dBFS` is another **2x amplitude** above `-14 dBFS`

So dB compresses huge ratios into manageable numbers, because raw audio amplitude otherwise behaves like a little goblin.

If you want, next I can turn these ranges into a tiny status classifier that adds labels like `"rms_status": "good"` and `"clip_status": "danger"` directly into the JSON.
