import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import GLib from "gi://GLib";

import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

function _isValidIPv4(ip) {
  if (typeof ip !== "string" || ip.trim() === "") {
    return false;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((n) => {
    const num = parseInt(n, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && String(num) === n;
  });
}

const IPProfileRow = GObject.registerClass(
  class IPProfileRow extends Adw.ActionRow {
    _init(profile, onEdit, onDelete) {
      super._init();
      this._profile = profile;
      this._onEdit = onEdit;
      this._onDelete = onDelete;

      this.set_margin_bottom(6);

      this._buildRow();
      this._updateLabels();
    }

    _buildRow() {
      const box = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
      });

      const labelBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 4,
        hexpand: true,
      });

      this._nameLabel = new Gtk.Label({
        halign: Gtk.Align.START,
        css_classes: ["heading"],
      });
      this._nameLabel.set_margin_start(6);

      this._detailsLabel = new Gtk.Label({
        halign: Gtk.Align.START,
        css_classes: ["dim-label", "caption"],
      });
      this._detailsLabel.set_margin_start(6);

      labelBox.append(this._nameLabel);
      labelBox.append(this._detailsLabel);

      const editButton = new Gtk.Button({
        icon_name: "document-edit-symbolic",
        css_classes: ["flat"],
        tooltip_text: _("Edit Profile"),
      });
      editButton.connect("clicked", () => {
        this._onEdit(this._profile);
      });

      const deleteButton = new Gtk.Button({
        icon_name: "user-trash-symbolic",
        css_classes: ["flat"],
        tooltip_text: _("Delete Profile"),
      });
      deleteButton.connect("clicked", () => {
        this._onDelete(this._profile);
      });

      box.append(labelBox);
      box.append(editButton);
      box.append(deleteButton);

      this.set_child(box);
    }

    _updateLabels() {
      this._nameLabel.set_text(this._profile.name);
      this._detailsLabel.set_text(
        `IP: ${this._profile.ip}/${this._profile.subnet}\nGateway: ${this._profile.gateway}`
      );
    }

    updateProfile(profile) {
      this._profile = profile;
      this._updateLabels();
    }
  }
);

export default class IPChangerPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    this._settings = this.getSettings();
    this._profiles = this._loadProfiles();

    window.set_title("IPchanger");
    window.set_default_size(600, 400);

    const page = new Adw.PreferencesPage();
    window.add(page);

    const group = new Adw.PreferencesGroup({
      title: "IP Profiles",
      description: "Manage your IP configuration profiles",
    });
    page.add(group);

    const addButton = new Gtk.Button({
      label: "Add New IP Profile",
      css_classes: ["suggested-action"],
      margin_top: 12,
      margin_bottom: 12,
    });
    addButton.connect("clicked", () => {
      this._showProfileDialog(window);
    });
    group.add(addButton);

    this._profilesList = new Gtk.ListBox({
      css_classes: ["boxed-list"],
    });
    group.add(this._profilesList);

    this._updateProfilesList(window);
  }

  _updateProfilesList(window) {
    let child = this._profilesList.get_first_child();
    while (child) {
      let next = child.get_next_sibling();
      this._profilesList.remove(child);
      child = next;
    }

    this._profiles.forEach((profile) => {
      const row = new IPProfileRow(
        profile,
        (p) => this._editProfile(p, window),
        (p) => this._deleteProfile(p, window)
      );
      this._profilesList.append(row);
    });

    if (this._profiles.length === 0) {
      const emptyRow = new Adw.ActionRow({
        title: "No IP profiles configured",
        subtitle: 'Click "Add New IP Profile" to create your first IP profile',
      });
      this._profilesList.append(emptyRow);
    }
  }

  _validateForm(nameEntry, ipEntry, subnetEntry, gatewayEntry) {
    let allValid = true;

    if (nameEntry.get_text().trim() === "") {
      nameEntry.add_css_class("error");
      allValid = false;
    } else {
      nameEntry.remove_css_class("error");
    }

    if (!_isValidIPv4(ipEntry.get_text().trim())) {
      ipEntry.add_css_class("error");
      allValid = false;
    } else {
      ipEntry.remove_css_class("error");
    }

    const subnetText = subnetEntry.get_text().trim();
    const subnet = parseInt(subnetText, 10);
    if (subnetText === "" || isNaN(subnet) || subnet < 0 || subnet > 32) {
      subnetEntry.add_css_class("error");
      allValid = false;
    } else {
      subnetEntry.remove_css_class("error");
    }

    if (!_isValidIPv4(gatewayEntry.get_text().trim())) {
      gatewayEntry.add_css_class("error");
      allValid = false;
    } else {
      gatewayEntry.remove_css_class("error");
    }
    return allValid;
  }

  _showProfileDialog(parent, profile = null) {
    const dialog = new Adw.MessageDialog({
      transient_for: parent,
      modal: true,
      heading: profile ? "Edit IP Profile" : "Add New IP Profile",
    });

    const form = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 12,
      margin_top: 12,
      margin_bottom: 12,
      margin_start: 12,
      margin_end: 12,
    });

    const nameEntry = new Gtk.Entry({
      text: profile ? profile.name : "",
      placeholder_text: "IP profile name (e.g., Work, Home)",
    });
    form.append(
      new Gtk.Label({
        label: "Profile Name:",
        halign: Gtk.Align.START,
      })
    );
    form.append(nameEntry);

    const ipEntry = new Gtk.Entry({
      text: profile ? profile.ip : "",
      placeholder_text: "192.168.1.100",
    });
    form.append(
      new Gtk.Label({
        label: "IP Address:",
        halign: Gtk.Align.START,
      })
    );
    form.append(ipEntry);

    const subnetEntry = new Gtk.Entry({
      text: profile ? profile.subnet : "24",
      placeholder_text: "24",
    });
    form.append(
      new Gtk.Label({
        label: "Subnet (CIDR):",
        halign: Gtk.Align.START,
      })
    );
    form.append(subnetEntry);

    const gatewayEntry = new Gtk.Entry({
      text: profile ? profile.gateway : "",
      placeholder_text: "192.168.1.1",
    });
    form.append(
      new Gtk.Label({
        label: "Gateway:",
        halign: Gtk.Align.START,
      })
    );
    form.append(gatewayEntry);

    const validateAll = () => {
      const isValid = this._validateForm(
        nameEntry,
        ipEntry,
        subnetEntry,
        gatewayEntry
      );
      dialog.set_response_enabled("save", isValid);
    };

    nameEntry.connect("changed", validateAll);
    ipEntry.connect("changed", validateAll);
    subnetEntry.connect("changed", validateAll);
    gatewayEntry.connect("changed", validateAll);

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      validateAll();
      return GLib.SOURCE_REMOVE;
    });

    dialog.set_extra_child(form);

    dialog.add_response("cancel", "Cancel");
    dialog.add_response("save", profile ? "Save" : "Add");
    dialog.set_response_appearance("save", Adw.ResponseAppearance.SUGGESTED);

    dialog.connect("response", (dialog, response) => {
      if (response === "save") {
        if (
          !this._validateForm(nameEntry, ipEntry, subnetEntry, gatewayEntry)
        ) {
          return;
        }

        const newProfile = {
          id: profile ? profile.id : Date.now().toString(),
          name: nameEntry.get_text().trim(),
          ip: ipEntry.get_text().trim(),
          subnet: subnetEntry.get_text().trim(),
          gateway: gatewayEntry.get_text().trim(),
        };

        if (profile) {
          const index = this._profiles.findIndex((p) => p.id === profile.id);
          if (index !== -1) {
            this._profiles[index] = newProfile;
          }
        } else {
          this._profiles.push(newProfile);
        }

        this._saveProfiles();
        this._updateProfilesList(parent);
      }
      dialog.close();
    });

    dialog.present();
  }

  _editProfile(profile, parent) {
    this._showProfileDialog(parent, profile);
  }

  _deleteProfile(profile, parent) {
    const dialog = new Adw.MessageDialog({
      transient_for: parent,
      modal: true,
      heading: "Delete IP Profile",
      body: `Are you sure you want to delete the IP profile "${profile.name}"?`,
    });

    dialog.add_response("cancel", "Cancel");
    dialog.add_response("delete", "Delete");
    dialog.set_response_appearance(
      "delete",
      Adw.ResponseAppearance.DESTRUCTIVE
    );

    dialog.connect("response", (dialog, response) => {
      if (response === "delete") {
        this._profiles = this._profiles.filter((p) => p.id !== profile.id);
        this._saveProfiles();
        this._updateProfilesList(parent);
      }
      dialog.close();
    });

    dialog.present();
  }

  _loadProfiles() {
    try {
      const profilesJson = this._settings.get_string("ip-profiles");
      return JSON.parse(profilesJson);
    } catch (e) {
      return [];
    }
  }

  _saveProfiles() {
    this._settings.set_string("ip-profiles", JSON.stringify(this._profiles));
  }
}
