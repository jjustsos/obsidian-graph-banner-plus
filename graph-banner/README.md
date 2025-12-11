# Graph Banner Plus

Improved version of the **Graph Banner** plugin.  
Shows a local graph banner right under the note title, with better performance and more convenient controls.

基于 Graph Banner 插件的增强版，在保持原有体验的基础上，重点优化性能和交互，并增加更方便的设置入口。

---

## Features

### Local graph banner under the note title

- Displays the **local graph** of the current note as a compact banner right under the inline title.
- Works in both edit and reading modes (behavior is configurable).

### Adjustable banner height

- The banner has a **fixed height** that you can change in the plugin settings.
- Supported formats:
  - `14vh`, `20vh` (viewport height)
  - `200px` (fixed pixels)
  - or just `14` → interpreted as `14vh`
- When the height changes, the underlying local graph view is re-embedded and resized to better fit the new banner size.

### Performance optimizations

- **Avoids unnecessary re-renders**:
  - Only refreshes the local graph when the **current file actually changes**.
  - Layout changes (splitting panes, resizing panels, etc.) reuse the existing graph view instead of recreating it.
- **Debounced layout changes**:
  - Multiple rapid `layout-change` events are merged into one graph refresh.
  - Debounce time is configurable (default: 80ms).
- **Reuses graph view instances**:
  - Keeps a small pool of underlying `localgraph` views (configurable, default: 2).
  - Avoids silently creating a large number of hidden graph instances.
- **Lazy initialization**:
  - Graph banner is created only when a Markdown note is actually opened, instead of at plugin load time.

### Better interaction

- **Click to activate**:
  - The banner starts in a non-interactive state (for performance and to avoid accidental drags).
  - Click the banner once to enter interactive mode, then you can drag and zoom the graph as in the normal local graph view.
- **Bottom-right settings button**:
  - A small gear icon at the **bottom-right** corner of the banner.
  - Clicking it opens the **Graph Banner Plus** plugin settings directly.
- **Per-note toggle command**:
  - Command palette entry:  
    - `Graph Banner Plus: 切换当前笔记的 Graph Banner 显示`
  - Temporarily disable/enable the banner for the current file without editing frontmatter.

### Mobile behavior (if enabled)

- Configurable **mobile mode**:
  - `full`: behave the same as desktop.
  - `simplified`: smaller height and lower visual contrast for better performance.
  - `disabled`: do not show the banner on mobile at all.

### Ignore rules

- Paths can be excluded from showing a banner via ignore rules in settings.
- The rules support:
  - Blank lines and `#` comments
  - `!pattern` for negation
  - `*` as a simple wildcard
  - Substring matching if no wildcard is present

Useful for:

- Templates, archives, MOCs, and other high-degree notes that would be too heavy.
- Logs, daily notes, or any notes where the banner is not needed.

### Presets (optional)

- You can have multiple **presets** of settings:
  - e.g. “性能优先 / Performance first”, “平衡模式 / Balanced”, “信息优先 / Information rich”
- Presets can be saved and applied from the settings tab.

---

## Settings Overview

The plugin adds a settings tab with several groups (exact names may vary):

### Appearance

- **Banner height**
  - Controls the fixed height of the banner area.
  - Accepts `vh`, `px`, or bare numbers (treated as `vh`).
- **Compact mode (for edit view)**
  - Full, compact, or hidden in edit mode.

### Performance

- **Max graph views**
  - Maximum number of `localgraph` instances to reuse.
- **Layout debounce (ms)**
  - Debounce delay for `layout-change` events.
- **Time to remove leaf**
  - Delay for cleaning up detached graph leaves.

### Behavior & per-note control

- **Show in edit mode**
  - `full` / `compact` / `hidden`
- **Per-note toggle command**
  - Quickly disable / enable the banner for the current file.

### Mobile

- **Mobile mode**
  - `full` / `simplified` / `disabled`

### Ignore rules

- A multi-line text field describing which files/folders should not show a graph banner.
- Uses a lightweight ignore syntax:
  - `#` comments
  - `some/path/`
  - `Archive/*`
  - `!Important/*`

---

## Installation

### From Obsidian Community Plugins (once accepted)

1. Open **Settings → Community plugins → Browse**.
2. Search for **"Graph Banner Plus"**.
3. Click **Install**, then **Enable**.

### Manual installation

1. Download the latest release from the GitHub releases page.
2. Extract the plugin folder into:

   ```text
   <your vault>/.obsidian/plugins/graph-banner-plus/
   ```

3. Ensure the folder contains at least:
    
    ```text
    manifest.json
    main.js
    styles.css
    ```
    
4. Restart Obsidian (or reload plugins) and enable **Graph Banner Plus** under **Community plugins**.
    

---

## Usage

1. Open any Markdown note.
    
2. Make sure the note has an inline title (or normal title area), and the plugin is enabled.
    
3. A local graph banner will appear directly under the title (if the note is not ignored / disabled).
    
4. Click the banner once to enter interactive mode:
    
    - Drag nodes
        
    - Zoom in/out
        
    - Explore local connections
        
5. Use the bottom-right gear button to quickly open the plugin settings.
    

### Per-note toggle

- Use the command palette (`Ctrl/Cmd + P`) and run:
    
    - `Graph Banner Plus: 切换当前笔记的 Graph Banner 显示`
        
- This will disable or enable the banner for the current file without touching frontmatter.
    

---

## Limitations

- The **layout and boundaries** of the local graph are still controlled by Obsidian’s built-in graph engine.
    
- The plugin can:
    
    - Adjust the banner height,
        
    - Trigger graph resize / re-embedding,
        
    - Optimize performance and interaction.
        
- But it cannot fully override how Obsidian decides to center or zoom the local graph.  
    This is a limitation of the current Obsidian API.
    

---

## Credits

- Original plugin idea and implementation: **Graph Banner** by [ras0q](https://github.com/ras0q).
    
- This plugin extends and optimizes the behavior while keeping the core experience.
    

All optimizations and additional features in **Graph Banner Plus** are by **Aeon Chaser**.

License: MIT (see `LICENSE` file for details).
