
'use strict';

const { Plugin, MarkdownView, PluginSettingTab, Setting, Notice } = require('obsidian');

/**
 * Default settings for the Graph Banner plugin (optimized version).
 */
const DEFAULT_SETTINGS = {
  // Original options
  ignore: [],
  timeToRemoveLeaf: 100,

  // Performance
  maxGraphViews: 2,
  layoutDebounceMs: 80,

  // Appearance
  bannerHeight: '14vh',

  // Device behaviour
  mobileMode: 'full',          // 'full' | 'simplified' | 'disabled'
  showInEditMode: 'compact',   // 'full' | 'compact' | 'hidden'

  // Per-note control
  perNoteDisabledPaths: [],

  // Presets (user-saveable)
  presets: {
    preset1: null,
    preset2: null,
  },

  // Preset UI state
  lastAppliedPreset: 'none',
};

/**
 * Very small pattern matcher for ignore rules.
 * NOT full .gitignore, but supports:
 * - blank lines and comments (#)
 * - "!" negation
 * - "*" wildcard (match any chars)
 * - simple substring match if no wildcard
 */
function matchIgnore(path, patterns) {
  if (!patterns || !Array.isArray(patterns) || patterns.length === 0) return false;
  let ignored = false;

  const specials = /[\\^$+?.()|[\]{}]/g;

  const toRegExp = (pattern) => {
    const escaped = pattern.replace(specials, '\\$&');
    const reSource = '^' + escaped.replace(/\*/g, '.*') + '$';
    try {
      return new RegExp(reSource);
    } catch (e) {
      return null;
    }
  };

  for (let raw of patterns) {
    if (!raw) continue;
    let p = String(raw).trim();
    if (!p || p.startsWith('#')) continue;

    let negate = false;
    if (p.startsWith('!')) {
      negate = true;
      p = p.slice(1).trim();
      if (!p) continue;
    }

    let isMatch = false;
    if (p.includes('*')) {
      const re = toRegExp(p);
      if (re && re.test(path)) isMatch = true;
    } else {
      if (path.includes(p)) isMatch = true;
    }

    if (isMatch) {
      ignored = !negate;
    }
  }

  return ignored;
}

/**
 * Graph view wrapper used by the plugin.
 * Responsible for hosting the local graph and embedding it under the note title.
 */
class GraphView {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;

    this.leaf = app.workspace.getLeaf('tab');
    this.node = null;
    this.setupLeafPromise = this._setupLeaf(plugin.settings.timeToRemoveLeaf);

    this.currentFilePath = null;
    this.compact = false;
    this.mobileSimplified = false;
  }

  async _setupLeaf(timeToRemoveLeaf) {
    await this.leaf.setViewState({ type: 'localgraph' });

    const node = this.leaf.view.containerEl.find('.view-content');
    this.node = node;

    this._setupNode();

    const removeChild = () => {
      try {
        if (this.leaf.parent) {
          // @ts-ignore private API – same hack as original plugin
          this.leaf.parent.removeChild(this.leaf);
        }
      } catch (_) {
        // ignore
      }
    };

    if (timeToRemoveLeaf > 0) {
      setTimeout(removeChild, timeToRemoveLeaf);
    } else {
      removeChild();
    }
  }

  _setupNode() {
    const node = this.node;
    if (!node) return;

    node.addClass('graph-banner-content');

    const controls = node.find('.graph-controls');
    if (controls) controls.toggleClass('is-close', true);

    const overlay = document.createElement('div');
    overlay.addClass('graph-banner-overlay');
    overlay.style.pointerEvents = 'auto';
    node.insertBefore(overlay, node.querySelector('canvas'));

    // Small settings button overlayed on top-right
    const settingsBtn = document.createElement('div');
    settingsBtn.addClass('graph-banner-settings-button');
    settingsBtn.setAttr('aria-label', 'Graph Banner settings');
    settingsBtn.setAttr('role', 'button');
    settingsBtn.addEventListener('click', () => {
      if (this.plugin && typeof this.plugin.openSettingsPanel === 'function') {
        this.plugin.openSettingsPanel();
      }
    });
    overlay.appendChild(settingsBtn);


    // Overlay controls interactive mode
    overlay.addEventListener('pointerup', () => {
      if (this.isActive()) return;
      this.setActive(true);

      const abortController = new AbortController();
      document.addEventListener(
        'pointerdown',
        (e) => {
          if (!this.isActive()) return;
          const target = e.target;
          if (target && node.contains(target)) return;
          this.setActive(false);
          abortController.abort();
        },
        { signal: abortController.signal }
      );
    });
  }

  isActive() {
    return this.node && this.node.dataset['interactive'] === 'true';
  }


  setActive(active) {
    if (!this.node) return;
    this.node.dataset['interactive'] = String(active);
    const overlay = this.node.querySelector('.graph-banner-overlay');
    if (overlay) {
      overlay.style.pointerEvents = active ? 'none' : 'auto';
    }
    if (active) {
      this.node.addClass('graph-banner-active');
    } else {
      this.node.removeClass('graph-banner-active');
    }
  }

  setCompact(compact) {
    this.compact = !!compact;
    if (!this.node) return;
    this.node.toggleClass('graph-banner-compact', this.compact);
  }

  setMobileSimplified(flag) {
    this.mobileSimplified = !!flag;
    if (!this.node) return;
    this.node.toggleClass('graph-banner-mobile-simplified', this.mobileSimplified);
  }

  async forceRefresh(view, opts) {
    this.currentFilePath = null;
    return this.placeTo(view, opts);
  }

  async placeTo(view, opts) {
    await this.setupLeafPromise;
    if (!this.node) return;

    const file = view.file;
    if (!file) return;

    const filePath = file.path;
    const needNewState = this.currentFilePath !== filePath;

    if (needNewState) {
      await this.leaf.setViewState({
        type: 'localgraph',
        state: { file: filePath },
      });
      this.leaf.setGroup(filePath);
      this.currentFilePath = filePath;
    }

    const mode = view.getMode();
    const modeContainer = view.containerEl.find('.markdown-' + mode + '-view');
    if (!modeContainer) return;

    if (!this.isDescendantOf(modeContainer)) {
      const noteHeader = modeContainer.find('.inline-title');
      const parent = noteHeader && noteHeader.parentElement;
      if (!parent) return;
      parent.insertAfter(this.node, noteHeader);
    }

    this.node.addClass('graph-banner-visible');
    if (opts) {
      this.setCompact(!!opts.compact);
      this.setMobileSimplified(!!opts.mobileSimplified);
    }
    // Ensure the underlying local graph view is aware of the new container size.
    const viewInstance = this.leaf.view;
    if (viewInstance && typeof viewInstance.onResize === 'function') {
      try {
        viewInstance.onResize();
      } catch (_) {
        // ignore
      }
    }
  }

  isDescendantOf(parent) {
    if (!this.node || !parent) return false;
    return parent.contains(this.node);
  }

  setVisibility(show) {
    if (!this.node) return;
    this.node.toggleClass('hidden', !show);
    if (show) {
      this.node.addClass('graph-banner-visible');
    } else {
      this.node.removeClass('graph-banner-visible');
    }
  }

  detach() {
    try {
      this.leaf.detach();
    } catch (_) {
      // ignore
    }
    if (this.node) {
      this.node.removeClass('graph-banner-content');
      this.node.remove();
    }
  }
}

/**
 * Settings tab for the plugin.
 */
class GraphBannerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    // Title
    containerEl.createEl('h2', { text: 'Graph Banner – 优化版设置' });

    // Preset section
    containerEl.createEl('h3', { text: '预设模式（场景快速切换）' });

    new Setting(containerEl)
      .setName('应用预设')
      .setDesc('快速切换一组性能 / 外观参数。')
      .addDropdown((dd) => {
        dd.addOption('none', '不应用');
        dd.addOption('perf', '性能优先');
        dd.addOption('balanced', '平衡模式');
        dd.addOption('info', '信息优先');

        const { presets, lastAppliedPreset } = this.plugin.settings;
        if (presets && presets.preset1) dd.addOption('user1', '自定义预设 1');
        if (presets && presets.preset2) dd.addOption('user2', '自定义预设 2');

        dd.setValue(lastAppliedPreset || 'none');
        dd.onChange(async (value) => {
          if (value === 'none') {
            this.plugin.settings.lastAppliedPreset = 'none';
            await this.plugin.saveSettings();
            return;
          }

          if (value === 'perf') {
            this.plugin.applyBuiltinPreset('perf');
          } else if (value === 'balanced') {
            this.plugin.applyBuiltinPreset('balanced');
          } else if (value === 'info') {
            this.plugin.applyBuiltinPreset('info');
          } else if (value === 'user1') {
            this.plugin.applyUserPreset(1);
          } else if (value === 'user2') {
            this.plugin.applyUserPreset(2);
          }
          this.plugin.settings.lastAppliedPreset = value;
          await this.plugin.saveSettings();
          this.display();
          new Notice('Graph Banner：预设已应用。');
        });
      });

    // User presets
    const makeUserPresetSettings = (n) => {
      const key = 'preset' + n;
      const label = '自定义预设 ' + n;
      const hasPreset = !!(this.plugin.settings.presets && this.plugin.settings.presets[key]);

      new Setting(containerEl)
        .setName(label)
        .setDesc(hasPreset ? '已保存一份配置快照。' : '尚未保存。保存时会记录当前插件设置。')
        .addButton((btn) =>
          btn
            .setButtonText('保存当前配置')
            .onClick(async () => {
              this.plugin.saveCurrentToUserPreset(n);
              await this.plugin.saveSettings();
              this.display();
              new Notice(label + ' 已更新。');
            })
        )
        .addExtraButton((btn) =>
          btn
            .setIcon('trash')
            .setTooltip('清除该预设')
            .onClick(async () => {
              this.plugin.clearUserPreset(n);
              await this.plugin.saveSettings();
              this.display();
            })
        );
    };

    makeUserPresetSettings(1);
    makeUserPresetSettings(2);

    // Performance section
    containerEl.createEl('h3', { text: '性能' });

    new Setting(containerEl)
      .setName('最大 Graph 实例数')
      .setDesc('同一工作区最多保留多少个 Graph Banner 实例用于复用。建议 1–3。')
      .addSlider((slider) => {
        slider.setLimits(1, 5, 1);
        slider.setValue(this.plugin.settings.maxGraphViews || DEFAULT_SETTINGS.maxGraphViews);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.maxGraphViews = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('布局变更防抖时间（ms）')
      .setDesc('窗口拖动 / 面板变化时合并触发次数。数值越大，刷新频率越低。')
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.layoutDebounceMs))
          .setValue(String(this.plugin.settings.layoutDebounceMs || DEFAULT_SETTINGS.layoutDebounceMs))
          .onChange(async (value) => {
            const num = Number(value);
            if (!Number.isFinite(num) || num < 0) {
              new Notice('请输入非负数字。');
              return;
            }
            this.plugin.settings.layoutDebounceMs = num;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('高级：保留 Graph leaf 的时间（ms）')
      .setDesc(
        '内部会短暂创建一个本地图视图 leaf 用于绘制 Banner。' +
          '如果需要与 Sync Graph Settings 等插件联动，可以适当加大时间。设为 0 表示立即移除。'
      )
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.timeToRemoveLeaf))
          .setValue(String(this.plugin.settings.timeToRemoveLeaf))
          .onChange(async (value) => {
            const num = Number(value);
            if (!Number.isFinite(num) || num < 0) {
              new Notice('请输入非负数字。');
              return;
            }
            this.plugin.settings.timeToRemoveLeaf = num;
            await this.plugin.saveSettings();
          })
      );

    // Behaviour section
    containerEl.createEl('h3', { text: '行为与交互' });

    new Setting(containerEl)
      .setName('编辑模式显示方式')
      .setDesc('在编辑模式下如何显示 Banner。阅读模式始终使用完整 Banner。')
      .addDropdown((dd) => {
        dd.addOption('full', '完整显示');
        dd.addOption('compact', '压缩显示');
        dd.addOption('hidden', '隐藏');
        dd.setValue(this.plugin.settings.showInEditMode || DEFAULT_SETTINGS.showInEditMode);
        dd.onChange(async (value) => {
          this.plugin.settings.showInEditMode = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('移动端行为')
      .setDesc('在手机 / 平板上如何处理 Banner。')
      .addDropdown((dd) => {
        dd.addOption('full', '与桌面相同');
        dd.addOption('simplified', '简化图（更小、更淡）');
        dd.addOption('disabled', '完全禁用');
        dd.setValue(this.plugin.settings.mobileMode || DEFAULT_SETTINGS.mobileMode);
        dd.onChange(async (value) => {
          this.plugin.settings.mobileMode = value;
          await this.plugin.saveSettings();
        });
      });

    // Appearance section
    containerEl.createEl('h3', { text: '外观' });

    new Setting(containerEl)
      .setName('Banner 高度')
      .setDesc('例如：14vh、20vh、200px。用于控制 Banner 占用的垂直空间。')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.bannerHeight || '14vh')
          .setValue(this.plugin.settings.bannerHeight || DEFAULT_SETTINGS.bannerHeight || '14vh')
          .onChange(async (value) => {
            const v = (value || '').trim() || (DEFAULT_SETTINGS.bannerHeight || '14vh');
            this.plugin.settings.bannerHeight = v;
            this.plugin.applyBannerHeight();
            await this.plugin.saveSettings();
          })
      );

    // Rules section
    containerEl.createEl('h3', { text: '规则：忽略哪些笔记' });

    new Setting(containerEl)
      .setName('忽略路径模式')
      .setDesc(
        '一行一个模式。支持简单的 "*" 通配符和 "!" 取反。\n' +
          '示例：templates/*、Archive/*、!Archive/keep.md。'
      )
      .addTextArea((ta) => {
        ta.setPlaceholder('templates/*\nArchive/*\n!/Project/Index.md');
        ta.setValue((this.plugin.settings.ignore || []).join('\n'));
        ta.onChange(async (value) => {
          this.plugin.settings.ignore = value.split('\n');
          await this.plugin.saveSettings();
        });
      });

    // Per-note mute info
    new Setting(containerEl)
      .setName('当前笔记一键开关')
      .setDesc('通过命令面板：执行 “Graph Banner: 切换当前笔记 Banner 显示” 即可为当前笔记开 / 关 Banner。')
      .addExtraButton((btn) =>
        btn
          .setIcon('search')
          .setTooltip('打开命令面板（Ctrl/Cmd+P）后搜索 "Graph Banner"')
      );
  }
}

/**
 * Main plugin class.
 */
class GraphBannerPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.graphViews = [];
    this._layoutTimer = null;

    this.applyBannerHeight();

    this.addSettingTab(new GraphBannerSettingTab(this.app, this));

    // Let Style Settings pick up variables
    this.app.workspace.trigger('parse-style-settings');

    // Commands
    this.addCommand({
      id: 'toggle-current-note-banner',
      name: '切换当前笔记的 Graph Banner 显示',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;
        if (!checking) {
          this.toggleCurrentNote(view.file.path);
        }
        return true;
      },
    });

    // Events
    this.registerEvent(
      this.app.workspace.on('file-open', async (file) => {
        if (!file || file.extension !== 'md') return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || view.file !== file) return;
        await this.placeGraphView(view);
      })
    );

    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const wait = this.settings.layoutDebounceMs ?? DEFAULT_SETTINGS.layoutDebounceMs;
        if (this._layoutTimer !== null) {
          window.clearTimeout(this._layoutTimer);
        }
        this._layoutTimer = window.setTimeout(() => {
          this.placeGraphView(view);
        }, wait);
      })
    );

    // Lazy init: only for the active markdown view
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active && active.file && active.file.extension === 'md') {
      this.placeGraphView(active);
    }
  }

  
  openSettingsPanel() {
    const setting = this.app && this.app.setting;
    if (!setting) return;
    setting.open();
    if (typeof setting.openTabById === 'function') {
      try {
        setting.openTabById(this.manifest && this.manifest.id ? this.manifest.id : 'graph-banner');
      } catch (_) {
        // ignore
      }
    }
  }

onunload() {
    if (this._layoutTimer !== null) {
      window.clearTimeout(this._layoutTimer);
      this._layoutTimer = null;
    }
    for (const gv of this.graphViews) {
      try {
        gv.detach();
      } catch (_) {
        // ignore
      }
    }
    this.graphViews = [];
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  applyBannerHeight() {
    try {
      let height = this.settings.bannerHeight || DEFAULT_SETTINGS.bannerHeight || '14vh';
      if (typeof height === 'string') {
        const raw = height.trim();
        if (/^\d+(?:\.\d+)?$/.test(raw)) {
          // 数字则自动当作 vh
          height = raw + 'vh';
        } else {
          height = raw;
        }
      }
      document.documentElement.style.setProperty('--banner-height', height);

      // 当高度变化时，主动刷新当前笔记的 Graph Banner，使布局尽量适应新的空间
      const view = this.app && this.app.workspace && this.app.workspace.getActiveViewOfType
        ? this.app.workspace.getActiveViewOfType(MarkdownView)
        : null;
      if (!view || !view.file || view.file.extension !== 'md') return;

      const path = view.file.path;

      // 已被 per-note 关闭则直接返回
      if (this.isNoteDisabled(path)) return;

      // ignore 规则命中也直接返回
      const ignored = matchIgnore(path, this.settings.ignore);
      if (ignored) return;

      const gv = this._getOrCreateGraphView(view);

      // 模式相关：编辑模式可能隐藏 / 压缩
      const mode = view.getMode();
      let compact = false;
      if (mode === 'source') {
        const behaviour = this.settings.showInEditMode || DEFAULT_SETTINGS.showInEditMode;
        if (behaviour === 'hidden') {
          gv.setVisibility(false);
          return;
        } else if (behaviour === 'compact') {
          compact = true;
        }
      }

      // 移动端行为
      const isMobile = this.isMobile();
      let mobileSimplified = false;
      const mobileMode = this.settings.mobileMode || DEFAULT_SETTINGS.mobileMode;
      if (isMobile) {
        if (mobileMode === 'disabled') {
          gv.setVisibility(false);
          return;
        } else if (mobileMode === 'simplified') {
          mobileSimplified = true;
        }
      }

      gv.setVisibility(true);
      gv.forceRefresh(view, { compact, mobileSimplified });
    } catch (_) {
      // ignore DOM errors
    }
  }

  isMobile() {
    try {
      // @ts-ignore
      return !!window.Platform?.isMobile;
    } catch (_) {
      return false;
    }
  }

  isNoteDisabled(path) {
    const list = this.settings.perNoteDisabledPaths || [];
    return list.includes(path);
  }

  toggleCurrentNote(path) {
    const list = this.settings.perNoteDisabledPaths || [];
    const idx = list.indexOf(path);
    if (idx === -1) {
      list.push(path);
      new Notice('已为当前笔记关闭 Graph Banner。');
    } else {
      list.splice(idx, 1);
      new Notice('已为当前笔记重新开启 Graph Banner。');
    }
    this.settings.perNoteDisabledPaths = list;
    this.saveSettings();

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view && view.file && view.file.path === path) {
      this.placeGraphView(view);
    }
  }

  /**
   * Built-in presets.
   */
  applyBuiltinPreset(name) {
    if (name === 'perf') {
      this.settings.maxGraphViews = 1;
      this.settings.layoutDebounceMs = 120;
      this.settings.showInEditMode = 'hidden';
      this.settings.mobileMode = 'disabled';
    } else if (name === 'balanced') {
      this.settings.maxGraphViews = 2;
      this.settings.layoutDebounceMs = 80;
      this.settings.showInEditMode = 'compact';
      this.settings.mobileMode = 'simplified';
    } else if (name === 'info') {
      this.settings.maxGraphViews = 3;
      this.settings.layoutDebounceMs = 40;
      this.settings.showInEditMode = 'full';
      this.settings.mobileMode = 'full';
    }
  }

  /**
   * User presets: store / restore a snapshot of core settings.
   */
  _getCoreSettingsSnapshot() {
    const {
      maxGraphViews,
      layoutDebounceMs,
      mobileMode,
      showInEditMode,
      timeToRemoveLeaf,
      ignore,
      bannerHeight,
    } = this.settings;

    return {
      maxGraphViews,
      layoutDebounceMs,
      mobileMode,
      showInEditMode,
      timeToRemoveLeaf,
      bannerHeight,
      ignore: Array.isArray(ignore) ? [...ignore] : [],
    };
  }

  _applyCoreSettingsSnapshot(snapshot) {
    if (!snapshot) return;
    this.settings.maxGraphViews = snapshot.maxGraphViews ?? this.settings.maxGraphViews;
    this.settings.layoutDebounceMs = snapshot.layoutDebounceMs ?? this.settings.layoutDebounceMs;
    this.settings.mobileMode = snapshot.mobileMode ?? this.settings.mobileMode;
    this.settings.showInEditMode = snapshot.showInEditMode ?? this.settings.showInEditMode;
    this.settings.timeToRemoveLeaf = snapshot.timeToRemoveLeaf ?? this.settings.timeToRemoveLeaf;
    this.settings.bannerHeight = snapshot.bannerHeight ?? this.settings.bannerHeight;
    if (snapshot.ignore) {
      this.settings.ignore = Array.isArray(snapshot.ignore) ? [...snapshot.ignore] : [];
    }
  }

  saveCurrentToUserPreset(n) {
    if (!this.settings.presets) this.settings.presets = { preset1: null, preset2: null };
    const snapshot = this._getCoreSettingsSnapshot();
    if (n === 1) {
      this.settings.presets.preset1 = snapshot;
    } else if (n === 2) {
      this.settings.presets.preset2 = snapshot;
    }
  }

  clearUserPreset(n) {
    if (!this.settings.presets) return;
    if (n === 1) {
      this.settings.presets.preset1 = null;
    } else if (n === 2) {
      this.settings.presets.preset2 = null;
    }
  }

  applyUserPreset(n) {
    if (!this.settings.presets) return;
    const snapshot = n === 1 ? this.settings.presets.preset1 : this.settings.presets.preset2;
    if (!snapshot) {
      new Notice('该自定义预设尚未保存。');
      return;
    }
    this._applyCoreSettingsSnapshot(snapshot);
  }

  async placeGraphView(view) {
    const file = view.file;
    if (!file || file.extension !== 'md') return;

    const path = file.path;

    // Per-note mute
    if (this.isNoteDisabled(path)) {
      const gv = this._getOrCreateGraphView(view);
      gv.setVisibility(false);
      return;
    }

    // Ignore patterns
    const ignored = matchIgnore(path, this.settings.ignore);
    const gv = this._getOrCreateGraphView(view);
    gv.setVisibility(!ignored);
    if (ignored) return;

    // Mode-specific behaviour
    const mode = view.getMode();
    let compact = false;

    if (mode === 'source') {
      const behaviour = this.settings.showInEditMode || DEFAULT_SETTINGS.showInEditMode;
      if (behaviour === 'hidden') {
        gv.setVisibility(false);
        return;
      } else if (behaviour === 'compact') {
        compact = true;
      }
    }

    // Mobile behaviour
    const isMobile = this.isMobile();
    let mobileSimplified = false;
    const mobileMode = this.settings.mobileMode || DEFAULT_SETTINGS.mobileMode;

    if (isMobile) {
      if (mobileMode === 'disabled') {
        gv.setVisibility(false);
        return;
      } else if (mobileMode === 'simplified') {
        mobileSimplified = true;
      }
    }

    gv.setVisibility(true);
    await gv.placeTo(view, { compact, mobileSimplified });
  }

  _getOrCreateGraphView(view) {
    const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
    const markdownNodes = markdownLeaves.map((leaf) => leaf.view.containerEl);

    // 1) Already attached to this view?
    for (const gv of this.graphViews) {
      if (gv.isDescendantOf(view.containerEl)) return gv;
    }

    // 2) Reuse a detached one (not under any markdown container)
    for (const gv of this.graphViews) {
      const isAttachedSomewhere = markdownNodes.some((node) => gv.isDescendantOf(node));
      if (!isAttachedSomewhere) return gv;
    }

    // 3) Enforce a hard cap on instances; reuse the first one if exceeded
    const max = this.settings.maxGraphViews || DEFAULT_SETTINGS.maxGraphViews;
    if (this.graphViews.length >= max) {
      return this.graphViews[0];
    }

    // 4) Create new
    const gv = new GraphView(this.app, this);
    this.graphViews.push(gv);
    return gv;
  }
}

module.exports = GraphBannerPlugin;
