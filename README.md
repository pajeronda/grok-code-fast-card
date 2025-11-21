# 🤖 Grok Code Fast Card

A Lovelace custom card providing a unified chat interface for real-time provisioning, editing, and technical debugging of Home Assistant configurations, accessed directly within the Dashboard.

---
> **⚠️ Important:
> This card requires the [xAI Conversation](https://github.com/pajeronda/xai_conversation) with the **Grok Code Fast** service configured in Home Assistant.**
---
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2025.10%2B-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## ✨ Features

- 💬 **Interactive Chat**: Chat bubble style interface with conversation history
- 💾 **Auto-save**: Persistent chat history and code using localStorage
- ⌨️ **Send on Enter**: Optional keyboard shortcut (configurable checkbox)
- 📎 **File Attachments**: Upload and send files (text, JSON, etc.) with your prompts
- ♻️ **Code Iteration**: Automatically sends current code for refinement and updates
- 👤 **Multi-User Support**: Tracks user context for personalized service
- 🔄 **Conversation Continuity**: Maintains context across multiple user devices (Laptop, Tablet, etc..)
- 🌙 **Theme Support**: Follows Home Assistant theme colors
- 🎨 **Responsive Design**: Adapts to any screen size
  
## 🔧 Requirements

### Required: xAI Conversation Integration with Grok Code Fast Service

This card is **specifically designed** to work with the **xAI Conversation integration's Grok Code Fast service**:

✅ Install the [xAI Conversation integration](https://github.com/pajeronda/xai_conversation)

**Without the xAI Conversation integration, this card will not function.**

### Home Assistant Version
- Home Assistant 2025.10 or newer
- Frontend with container queries support (2025.7+ recommended)

## 📦 Installation

### Via HACS (Recommended)

### Click this badge to install **xAI Conversation** via **HACS**
[![Install via your HACS instance.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Pajeronda&repository=xai_conversation&category=integration)

### Click this badge to install **Grok Code Fast Card** via **HACS**
[![Install via your HACS instance.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=pajeronda&repository=grok-code-fast-card&category=plugin)

**Manual**

1. Open HACS
2. Go to "Frontend"
3. Click the three dots menu → "Custom repositories"
4. Add this repository URL: `https://github.com/pajeronda/grok-code-fast-card`
5. Click "Install"

### Manual Installation

1. Download `grok-code-fast-card.js` from this repository
2. Copy to `/config/www/`
3. Add resource to Lovelace:
   - Go to **Settings** → **Dashboards** → **Resources**
   - Click **+ ADD RESOURCE**
   - Enter:
     - **URL**: `/local/www/grok-code-fast-card.js`
     - **Type**: JavaScript Module
   - Click **CREATE**

4. Refresh browser cache (Ctrl+Shift+R)

## 🚀 Usage
---
**mode card:**

<img width="40%" height="auto" alt="immagine" src="https://github.com/user-attachments/assets/5013de61-b26c-41c1-a4f4-3175f9ad131d" />

**fullscreen:**

<img width="70%" height="auto" alt="immagine" src="https://github.com/user-attachments/assets/cd37e3a1-c087-40f4-9dd9-d042f74e6293" />

---

### Add Card to Dashboard

1. Edit your dashboard
2. Click **+ ADD CARD**
3. Search for **"Grok Code Fast Card"**
4. Click **SAVE**

Or add manually in YAML mode:
```yaml
type: custom:grok-code-fast-card
theme: <your theme>
```

Example with panel mode:

```yaml
- type: panel
    path: code
    title: GROK CODE FAST
    cards:
      - type: custom:grok-code-fast-card
        theme: <your theme>
```

Example with Browser mod:

```yaml
action: fire-dom-event
browser_mod:
  service: browser_mod.popup
  data:
    initial_style: normal
    style_sequence:
      - normal
      - fullscreen
      - wide
    title: '(tap 👆 here)'
    content:
      type: custom:grok-code-fast-card
      theme: <your theme>
```
### Optional Configuration

The card works without configuration.


## ⚙️ Features Explained

### File Attachments
Upload files to provide context for Grok:
- 📎 **Attach Button**: Click paperclip icon to select files
- 🖼️ **Supported Types**: Images (PNG, JPG, GIF), text files, JSON, YAML, code files
- 👁️ **Preview**: Attached files shown as badges with filename and size
- ❌ **Remove**: Click X on badge to remove attachment before sending
- 📤 **Auto-clear**: Attachments cleared after successful send
- 💾 **Storage**: File metadata saved in chat history


### Send on Enter
Enable the checkbox in the footer to send messages with Enter key:
- ✅ **Enter**: Send message (when checkbox enabled)
- ✅ **Shift+Enter**: Always adds new line (regardless of checkbox)
- ✅ **Unchecked**: Enter adds new line normally

### Chat History
- 💬 Bubble-style chat interface
- 👤 User messages align right (blue background)
- 🤖 Grok responses align left (card background)
- 📋 All text is selectable and copyable
- 📎 File attachments shown as badges in user messages
- 💾 Auto-saves to localStorage

### Code Editor
- ✨ Syntax highlighting for Jinja2/YAML
- 🔢 Line numbers enabled
- 📏 Auto-height on desktop, fixed on mobile
- 📋 One-click copy button
- 🎨 Follows Home Assistant theme
- ♻️ **Code Iteration**: Current code automatically sent with each request for refinement

### Conversation Continuity
- 🔄 **Context Preservation**: Each response includes a unique ID
- 🧠 **Memory**: Previous response ID sent with next request
- 💬 **Natural Flow**: Grok remembers conversation context
- 👤 **User Tracking**: Maintains separate conversations per user


## 📝 Example Prompts

Try these with the Grok Code Fast service:

**Basic prompts:**
- "Create an automation to turn on lights when motion is detected"
- "Fix this template: `{{ states('sensor.temp') * 2 }}`"
- "Make a template sensor for average temperature from 3 sensors"
- "Help me create a script to announce weather via TTS"
- "Generate a Lovelace card config for displaying energy usage"
- "Create a binary sensor that checks if it's nighttime"

**With file attachments:**
- Upload screenshot: "Explain what this error means and how to fix it"
- Attach JSON file: "Parse this API response and create sensors for each value"
- Send image: "Create an automation based on this state machine diagram"
- Upload config file: "Review this automation and suggest improvements"

**Code iteration:**
- First: "Create a motion light automation"
- Then: "Add a condition to only work at night"
- Then: "Also add a delay before turning off"
- (Card automatically sends current code for context)

## 🐛 Troubleshooting

### Card not showing
- ✅ Check resource is loaded: **Settings** → **Dashboards** → **Resources**
- ✅ Verify file exists at `/config/www/community/grok-code-fast-card/grok-code-fast-card.js`
- ✅ Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
- ✅ Check browser console (F12) for errors

### No response from Grok
- ❌ **Most Common**: xAI Conversation integration not installed
- ✅ Verify integration: **Settings** → **Devices & Services** → look for "xAI Conversation"
- ✅ Check service exists: **Developer Tools** → **Services** → search "grok_code_fast"
- ✅ Check Home Assistant logs for integration errors

### Chat not saving
- ✅ Ensure browser localStorage is enabled
- ✅ Check no browser extensions are blocking storage
- ✅ Private/Incognito mode may block localStorage
- ✅ Check browser console for storage errors

### File attachments not working
- ✅ Check file size (large files may cause issues)
- ✅ Verify file type is supported (images, text, JSON, YAML, etc.)
- ✅ Check browser console for file reading errors
- ✅ Ensure browser supports FileReader API

### Conversation context lost
- ✅ Verify xAI Conversation integration supports conversation memory
- ✅ Check browser console for service call logs
- ✅ Clear localStorage and restart conversation if corrupted

### Formatting issues
- ✅ Ensure Home Assistant 2025.1+
- ✅ Update to latest Home Assistant version
- ✅ Test in different browser (Chrome/Firefox/Safari)
- ✅ Check if browser supports CSS container queries


## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 👤 Author

**Pajeronda**
- GitHub: [@pajeronda](https://github.com/pajeronda)
- Repository: [grok-code-fast-card](https://github.com/pajeronda/grok-code-fast-card)
- Repository: [xai conversation](https://github.com/pajeronda/xai_conversation)


## ⭐ Support

If you find this card useful:
- ⭐ Star the repository
- 🐛 Report bugs via [Issues](https://github.com/pajeronda/grok-code-fast-card/issues)
- 💡 Suggest features via [Discussions](https://github.com/pajeronda/grok-code-fast-card/discussions)
- 📢 Share with the Home Assistant community

## 🔗 Related Projects

- **[xAI Conversation Integration](https://github.com/pajeronda/xai_conversation)** - **Required** integration that provides the Grok Code Fast service
- [Home Assistant](https://www.home-assistant.io/) - Open source home automation platform

## Legal Notes

- API Usage: This integration requires an active xAI account and a valid API key. Use of the xAI API is subject to xAI's terms of service.
- Trademarks: xAI, Grok, and related logos are registered trademarks of xAI Corp. This project is an unofficial integration developed by @pajeronda and is not affiliated with, sponsored by, or endorsed by xAI Corp.

---

Made with ❤️ by [Pajeronda](https://github.com/pajeronda) • v1.0.2 • Updated 2025-11-19

---
