import GObject from "gi://GObject";
import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

const IPChangerIndicator = GObject.registerClass(
  class IPChangerIndicator extends PanelMenu.Button {
    _init(settings) {
      super._init(0.0, "IPchanger");

      // Create the panel button icon
      this._icon = new St.Icon({
        icon_name: "network-wired-symbolic",
        style_class: "system-status-icon",
      });
      this.add_child(this._icon);

      // Store settings reference
      this._settings = settings;

      // Build the menu
      this._buildMenu();

      // Connect to settings changes
      this._settingsChangedId = this._settings.connect("changed", () => {
        this._rebuildMenu();
      });
    }

    destroy() {
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
      }
      super.destroy();
    }

    _buildMenu() {
      this.menu.removeAll();

      // Add title
      let connectionIcon = new St.Icon({
        icon_name: "network-wired-symbolic",
        style_class: "popup-menu-icon",
        style: "margin-right: 6px;",
      });
      let titleItem = new PopupMenu.PopupMenuItem("IP Profiles", {
        reactive: false,
        style_class: "popup-menu-item-title",
      });
      titleItem.insert_child_at_index(connectionIcon, 1);
      this.menu.addMenuItem(titleItem);

      // Get saved IP profiles
      let profiles = this._getProfiles();

      if (profiles.length === 0) {
        let noProfilesItem = new PopupMenu.PopupMenuItem(
          "No IP profiles configured",
          {
            reactive: false,
          }
        );
        this.menu.addMenuItem(noProfilesItem);
      } else {
        profiles.forEach((profile) => {
          let item = new PopupMenu.PopupBaseMenuItem();
          let textBox = new St.BoxLayout({ vertical: true });

          // Main title
          let title = new St.Label({
            text: profile.name,
            style_class: "popup-menu-item",
            style: "color: #fff;",
          });

          // Detail label with clearer style override
          let detail = new St.Label({
            text: "IP: " + profile.ip,
            style: "font-size: 12px; color: #888;",
          });

          textBox.add_child(title);
          textBox.add_child(detail);
          item.add_child(textBox);
          item.connect("activate", () => {
            this._applyProfile(profile);
          });
          this.menu.addMenuItem(item);
        });
      }

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      // Add DHCP option
      let resetIcon = new St.Icon({
        icon_name: "view-refresh-symbolic",
        style_class: "popup-menu-icon",
        style: "margin-right: 6px;",
      });
      let dhcpItem = new PopupMenu.PopupMenuItem("Reset to DHCP");
      dhcpItem.insert_child_at_index(resetIcon, 1);
      dhcpItem.connect("activate", () => {
        this._switchToDHCP();
      });
      this.menu.addMenuItem(dhcpItem);

      // ADD settings option
      let settingsIcon = new St.Icon({
        icon_name: "preferences-system-symbolic",
        style_class: "popup-menu-icon",
        style: "margin-right: 6px;",
      });
      let prefsItem = new PopupMenu.PopupMenuItem("Settings");
      prefsItem.insert_child_at_index(settingsIcon, 1);
      prefsItem.connect("activate", () => {
        this._openPreferences();
      });
      this.menu.addMenuItem(prefsItem);
    }

    _rebuildMenu() {
      this._buildMenu();
    }

    _getProfiles() {
      try {
        let profilesJson = this._settings.get_string("ip-profiles");
        return JSON.parse(profilesJson);
      } catch (e) {
        return [];
      }
    }

    _applyProfile(profile) {
      // Get active connection name
      let connectionName = this._getActiveConnectionName();
      if (!connectionName) {
        this._showNotification("No active connection found");
        return;
      }

      // Apply the IP configuration using nmcli
      let command = [
        "nmcli",
        "connection",
        "modify",
        connectionName,
        "ipv4.method",
        "manual",
        "ipv4.addresses",
        `${profile.ip}/${profile.subnet}`,
        "ipv4.gateway",
        profile.gateway,
      ];

      // Add DNS if specified
      if (profile.dns && profile.dns.trim() !== "") {
        command.push("ipv4.dns", profile.dns);
      }

      try {
        let proc = Gio.Subprocess.new(
          command,
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        proc.communicate_utf8_async(null, null, (proc, res) => {
          try {
            let [, stdout, stderr] = proc.communicate_utf8_finish(res);
            if (proc.get_successful()) {
              // Restart the connection to apply changes
              this._restartConnection(connectionName);
              this._showNotification(`Applied IP profile: ${profile.name}`);
            } else {
              this._showNotification(`Failed to apply IP profile: ${stderr}`);
            }
          } catch (e) {
            this._showNotification(`Error: ${e.message}`);
          }
        });
      } catch (e) {
        this._showNotification(`Error: ${e.message}`);
      }
    }

    _switchToDHCP() {
      let connectionName = this._getActiveConnectionName();
      if (!connectionName) {
        this._showNotification("No active connection found");
        return;
      }

      let command = [
        "nmcli",
        "connection",
        "modify",
        connectionName,
        "ipv4.method",
        "auto",
        "ipv4.addresses",
        "",
        "ipv4.gateway",
        "",
        "ipv4.dns",
        "",
      ];

      try {
        let proc = Gio.Subprocess.new(
          command,
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        proc.communicate_utf8_async(null, null, (proc, res) => {
          try {
            let [, stdout, stderr] = proc.communicate_utf8_finish(res);
            if (proc.get_successful()) {
              this._restartConnection(connectionName);
              this._showNotification("Switched to DHCP");
            } else {
              this._showNotification(`Failed to switch to DHCP: ${stderr}`);
            }
          } catch (e) {
            this._showNotification(`Error: ${e.message}`);
          }
        });
      } catch (e) {
        this._showNotification(`Error: ${e.message}`);
      }
    }

    _getActiveConnectionName() {
      try {
        let proc = Gio.Subprocess.new(
          ["nmcli", "-t", "-f", "NAME", "connection", "show", "--active"],
          Gio.SubprocessFlags.STDOUT_PIPE
        );

        let [, stdout] = proc.communicate_utf8(null, null);

        if (proc.get_successful()) {
          let connections = stdout.toString().trim().split("\n");
          connections = connections.map((name) => name.replace(/\\(.)/g, "$1"));
          return connections[0] || null;
        }
      } catch (e) {
        console.log(`Error getting active connection: ${e.message}`);
      }
      return null;
    }

    _restartConnection(connectionName) {
      try {
        // Down the connection
        let downProc = Gio.Subprocess.new(
          ["nmcli", "connection", "down", connectionName],
          Gio.SubprocessFlags.NONE
        );

        downProc.wait_async(null, () => {
          // Small delay then bring connection back up
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            try {
              let upProc = Gio.Subprocess.new(
                ["nmcli", "connection", "up", connectionName],
                Gio.SubprocessFlags.NONE
              );
              upProc.wait_async(null, () => {
                // Connection should be back up
              });
            } catch (e) {
              console.log(`Error bringing connection up: ${e.message}`);
            }
            return GLib.SOURCE_REMOVE;
          });
        });
      } catch (e) {
        console.log(`Error restarting connection: ${e.message}`);
      }
    }

    _showNotification(message) {
      Main.notify("IPchanger", message);
      // Also log to console for debugging
      console.log(`IPchanger: ${message}`);
    }

    _openPreferences() {
      try {
        Gio.Subprocess.new(
          ["gnome-extensions", "prefs", "ipchanger@rezabakhshi.ir"],
          Gio.SubprocessFlags.NONE
        );
      } catch (e) {
        console.log(`Error opening preferences: ${e.message}`);
      }
    }
  }
);

export default class IPChangerExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this._indicator = null;
  }

  enable() {
    this._settings = this.getSettings();
    this._indicator = new IPChangerIndicator(this._settings);
    Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);
  }

  disable() {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
    if (this._settings) {
      this._settings = null;
    }
  }
}
