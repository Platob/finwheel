"""FinWheel hotkeys for OBS Studio.

Adds hotkeys (Settings -> Hotkeys) that control the FinWheel server:
spin, spin the next queued player, open/close/draw the raffle, dismiss the
result and toggle the overlay.

Install: Tools -> Scripts -> Python Settings (point OBS at a Python 3 install),
then Scripts -> "+" -> pick this file.
"""

import json
import threading
import urllib.error
import urllib.request

import obspython as obs

DEFAULT_URL = "http://127.0.0.1:4747"

HOTKEYS = [
    ("finwheel_spin", "FinWheel: Spin the active wheel", {"type": "spin"}),
    ("finwheel_spin_next", "FinWheel: Spin next in queue", {"type": "spinNext"}),
    ("finwheel_dismiss", "FinWheel: Dismiss result", {"type": "result.dismiss"}),
    ("finwheel_raffle_open", "FinWheel: Open raffle", {"type": "raffle.open"}),
    ("finwheel_raffle_close", "FinWheel: Close raffle", {"type": "raffle.close"}),
    ("finwheel_raffle_draw", "FinWheel: Draw raffle winner", {"type": "raffle.draw"}),
    ("finwheel_overlay_toggle", "FinWheel: Show/hide overlay", {"type": "overlay.toggle"}),
]

state = {"url": DEFAULT_URL, "token": "", "spins": 0}
hotkey_ids = {}


def send(command):
    """Posts a command without blocking the OBS UI thread."""
    command = dict(command)
    if command["type"] == "spin" and state["spins"] > 0:
        command["spins"] = state["spins"]
    threading.Thread(target=_post, args=(command,), daemon=True).start()


def _post(command):
    headers = {"Content-Type": "application/json"}
    if state["token"]:
        headers["Authorization"] = "Bearer " + state["token"]
    request = urllib.request.Request(
        state["url"].rstrip("/") + "/api/command",
        data=json.dumps(command).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            body = json.loads(response.read().decode("utf-8") or "{}")
            notice = body.get("notice")
            if notice:
                print("[FinWheel] " + notice.get("message", ""))
    except urllib.error.HTTPError as error:
        try:
            message = json.loads(error.read().decode("utf-8")).get("error", str(error))
        except ValueError:
            message = str(error)
        print("[FinWheel] " + message)
    except Exception as error:  # noqa: BLE001 - show any network problem in the script log
        print("[FinWheel] Could not reach the server: %s" % error)


def make_callback(command):
    def callback(pressed):
        if pressed:
            send(command)

    return callback


# ── OBS script API ────────────────────────────────────────────────────────


def script_description():
    return (
        "<h3>FinWheel</h3>"
        "<p>Hotkeys for the FinWheel casino wheel. Assign them in "
        "<b>Settings → Hotkeys</b>.</p>"
        "<p>Start the FinWheel server first (<code>npm start</code>).</p>"
    )


def script_properties():
    props = obs.obs_properties_create()
    obs.obs_properties_add_text(props, "url", "Server URL", obs.OBS_TEXT_DEFAULT)
    obs.obs_properties_add_text(props, "token", "Control token (optional)", obs.OBS_TEXT_PASSWORD)
    obs.obs_properties_add_int(props, "spins", "Spins per game (0 = wheel default)", 0, 20, 1)
    obs.obs_properties_add_button(props, "test", "Test: spin now", lambda *_: send({"type": "spin"}) or False)
    return props


def script_defaults(settings):
    obs.obs_data_set_default_string(settings, "url", DEFAULT_URL)
    obs.obs_data_set_default_int(settings, "spins", 0)


def script_update(settings):
    state["url"] = obs.obs_data_get_string(settings, "url") or DEFAULT_URL
    state["token"] = obs.obs_data_get_string(settings, "token")
    state["spins"] = obs.obs_data_get_int(settings, "spins")


def script_load(settings):
    for name, description, command in HOTKEYS:
        hotkey_id = obs.obs_hotkey_register_frontend(name, description, make_callback(command))
        hotkey_ids[name] = hotkey_id
        saved = obs.obs_data_get_array(settings, name)
        obs.obs_hotkey_load(hotkey_id, saved)
        obs.obs_data_array_release(saved)


def script_save(settings):
    for name, hotkey_id in hotkey_ids.items():
        saved = obs.obs_hotkey_save(hotkey_id)
        obs.obs_data_set_array(settings, name, saved)
        obs.obs_data_array_release(saved)
