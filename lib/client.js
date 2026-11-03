/**
 * dsh-sidebar-groups —— 浏览器半侧。
 *
 * 把 DSH 侧边栏导航（`nav.panelList`）里的面板行分成两组：
 *
 *   - 常驻（pinned）：默认「插件」和「自动化任务」两行，始终显示；
 *   - 工具（tools）：其余行，收在「工具」这一行下面，可折叠。
 *
 * 交互：
 *   - 点「工具」行：展开 / 收起；
 *   - 把常驻行拖到「工具」行上：收进工具组；
 *   - 把工具组里的一行（展开后）拖到任意常驻行上：拉出来固定，插到该行位置；
 *   - 右键任意行：菜单里也能完成同样的移动（拖动不可用时的退路）。
 *
 * 状态（谁在常驻、是否收起）存在 localStorage，重启后恢复。
 *
 * 实现约束：这是运行在 React 侧边栏里的纯 DOM 插件，所以
 *
 *   - **不搬运 React 的节点**：行的分组靠 flex `order` 重排 + CSS 隐藏，
 *     而不是把按钮从一个容器挪到另一个容器（那会打断 React 的 reconciliation）；
 *   - 只插入自己的一个「工具」按钮，并在 Shell 重新渲染后由 MutationObserver 自动补回；
 *   - 任何选择器落空时安静退出，不抛错（Web shell 里插件 apply 抛错会影响整个启动）。
 *
 * bundle 格式：宿主把 `./client` 作为经典脚本注入，脚本通过
 * `window.__ModuleLoader__.load({ id, factory })` 注册，factory 返回模块命名空间。
 */

window.__ModuleLoader__.load({
  id: 'dsh-sidebar-groups',
  factory: () => {
    'use strict'

    const module = { exports: {} }
    const exports = module.exports

    /** 版本号，只用于调试输出。 */
    const VERSION = '0.1.0'
    /** 持久化键：谁常驻、是否收起。 */
    const STORAGE_KEY = 'dsh.sidebar-groups.v1'

    /** 标记：这个 nav 已被接管。 */
    const ATTR_NAV = 'data-dsh-fold'
    /** 标记：「工具」这一行。 */
    const ATTR_HEADER = 'data-dsh-fold-header'
    /** 标记：行属于哪个区（pinned / tools）。 */
    const ATTR_ZONE = 'data-dsh-fold-zone'
    /** 标记：工具组当前是收起的。 */
    const ATTR_COLLAPSED = 'data-dsh-fold-collapsed'
    /** 拖放高亮。 */
    const ATTR_DROP = 'data-dsh-fold-drop'
    /** 正在被拖动的行。 */
    const ATTR_DRAGGING = 'data-dsh-fold-dragging'

    const SELECTOR_ROW = 'button[class*="panelRow"]'
    const SELECTOR_STYLE = 'style[data-dsh-fold-style]'

    /** flex order：常驻行 1000 起、工具行 6000 起，中间留出调整空间。 */
    const ORDER_PINNED = 1000
    const ORDER_HEADER = 5000
    const ORDER_TOOLS = 6000
    const ORDER_OTHER = 9000

    /** 首次运行时的常驻行（中英文都试一下，找不到就退化为第一行）。 */
    const DEFAULT_PINNED = new Set(['插件', '自动化任务', 'Plugins', 'Automated tasks', 'Scheduled tasks'])

    /** 界面语言决定「工具」这一行与菜单的文案。 */
    function strings() {
      const lang = (document.documentElement.lang || navigator.language || '').toLowerCase()
      if (lang.startsWith('en')) {
        return { group: 'Tools', moveIn: 'Move into Tools', pin: 'Pin to top', expanded: 'expanded', collapsed: 'collapsed' }
      }
      return { group: '工具', moveIn: '收进「工具」', pin: '固定到顶部', expanded: '已展开', collapsed: '已收起' }
    }

    /** 立方体图标（工具组）。 */
    const ICON_CUBE = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8 2.4 4.6v6.8L8 14.2l5.6-2.8V4.6L8 1.8Z"/><path d="M2.4 4.6 8 7.4l5.6-2.8M8 7.4v6.8"/></svg>'
    /** 折叠箭头。 */
    const ICON_CHEVRON = '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>'

    /** 注入的样式：全部以 nav[data-dsh-fold] 为前缀，避免污染别的区域。 */
    const CSS = `
nav[data-dsh-fold] > [data-dsh-fold-header] { cursor: pointer; }
nav[data-dsh-fold] > [data-dsh-fold-header] .dsh-fold-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
nav[data-dsh-fold] > [data-dsh-fold-header] .dsh-fold-count {
  margin-left: auto; flex: none; font-size: 12px; line-height: 16px;
  opacity: .55; font-variant-numeric: tabular-nums;
}
nav[data-dsh-fold] > [data-dsh-fold-header] .dsh-fold-chevron {
  flex: none; display: inline-flex; align-items: center; opacity: .55;
  transition: transform .15s var(--ds-ease-in-out, ease);
}
nav[data-dsh-fold][data-dsh-fold-collapsed] > [data-dsh-fold-header] .dsh-fold-chevron { transform: rotate(-90deg); }
nav[data-dsh-fold][data-dsh-fold-collapsed] > [data-dsh-fold-zone="tools"] { display: none !important; }
nav[data-dsh-fold] > [data-dsh-fold-zone="tools"] { padding-left: 20px; }
nav[data-dsh-fold] > [data-dsh-fold-dragging] { opacity: .45; }
nav[data-dsh-fold] > [data-dsh-fold-drop] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .14));
  box-shadow: inset 0 0 0 1px var(--dsw-alias-state-business-primary, rgba(77, 137, 255, .9));
}
.dsh-fold-menu {
  position: fixed; z-index: 9999; min-width: 168px; padding: 4px;
  display: flex; flex-direction: column; gap: 2px;
  border-radius: 8px; background: var(--dsw-alias-bg-elevated, #ffffff);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18); font-size: 13px;
}
.dsh-fold-menu button {
  all: unset; box-sizing: border-box; padding: 6px 10px; border-radius: 6px;
  cursor: pointer; white-space: nowrap;
}
.dsh-fold-menu button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .14)); }
`

    /** 运行期状态；`pinned === null` 表示还没初始化。 */
    const state = { collapsed: true, pinned: null }
    /** 是否已经从 localStorage 读过一次。 */
    let restored = false
    /** 正在被拖动的行标签。 */
    let dragLabel = null
    /** 打开中的右键菜单。 */
    let menuElement = null

    // ------------------------------------------------------------------ 状态

    /** 从 localStorage 恢复一次（不可用时静默退化为内存状态）。 */
    function loadState() {
      if (restored) return
      restored = true
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return
        const parsed = JSON.parse(raw)
        if (typeof parsed?.collapsed === 'boolean') state.collapsed = parsed.collapsed
        if (Array.isArray(parsed?.pinned)) {
          state.pinned = parsed.pinned.filter((item) => typeof item === 'string')
        }
      } catch {
        /* file://、隐私模式或坏数据：用默认值继续 */
      }
    }

    /** 写回 localStorage（失败不影响当前会话）。 */
    function saveState() {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ collapsed: state.collapsed, pinned: state.pinned ?? [] }),
        )
      } catch {
        /* ignore */
      }
    }

    // ------------------------------------------------------------------ DOM

    /** 侧边栏根元素（Brand 行所在的那一列）。 */
    function sidebarRoot() {
      const column = document.querySelector(
        '[data-pane="sidebar"], [class*="sidebarCol"], .dshDesktopUpstreamSidebar, .dshDesktopSidebarSurface',
      )
      const scope = column ?? document
      const logoOwner = scope.querySelector('[class*="logoRow"]')?.parentElement ?? null
      if (logoOwner !== null) return logoOwner
      const nav = scope.querySelector('nav[class*="panelList"]')
      return nav?.parentElement ?? null
    }

    /** 承载面板行的 nav。 */
    function panelNav() {
      const root = sidebarRoot()
      if (root === null) return null
      const direct = root.querySelector('nav[class*="panelList"]')
      if (direct !== null) return direct
      return Array.from(root.querySelectorAll('nav')).find((node) => node.querySelector(SELECTOR_ROW) !== null) ?? null
    }

    /** 是否是面板行（排除我们自己插入的「工具」行）。 */
    function isRow(element) {
      return element instanceof HTMLElement && element.matches(SELECTOR_ROW) && !element.hasAttribute(ATTR_HEADER)
    }

    /** nav 里所有的面板行。 */
    function rowList(nav) {
      return Array.from(nav.children).filter(isRow)
    }

    /** 行的稳定标识：优先 aria-label（面板名），退化为文字。 */
    function labelOf(row) {
      return row.getAttribute('aria-label') ?? (row.textContent ?? '').trim()
    }

    /** 侧边栏是否处于 56px 图标轨模式。 */
    function isRailMode(root) {
      return Array.from(root.classList).some((name) => name === 'collapsed' || /_collapsed$/.test(name))
    }

    // ------------------------------------------------------------------ 渲染

    /** 上一轮渲染的签名：状态没变就跳过 DOM 写入（聊天流式更新时每秒会触发很多次）。 */
    let lastSignature = ''

    /** 主渲染：幂等，可以被 MutationObserver 反复调用。 */
    function render() {
      const nav = panelNav()
      if (nav === null) return
      const rows = rowList(nav)
      if (rows.length === 0) return
      const root = sidebarRoot()
      const labels = rows.map(labelOf)

      if (state.pinned === null) {
        const matched = labels.filter((label) => DEFAULT_PINNED.has(label))
        state.pinned = matched.length > 0 ? matched : labels.slice(0, 1)
        saveState()
      }

      const rail = root !== null && isRailMode(root)
      const signature = [
        state.collapsed ? '1' : '0',
        rail ? '1' : '0',
        strings().group,
        labels.join('\u0001'),
        state.pinned.join('\u0001'),
      ].join('\u0002')
      const existing = nav.querySelector(`[${ATTR_HEADER}]`)
      const fresh = existing !== null && existing.isConnected &&
        rows.every((row) => row.hasAttribute(ATTR_ZONE) && row.style.order !== '')
      if (signature === lastSignature && fresh) return
      lastSignature = signature

      nav.setAttribute(ATTR_NAV, '')
      const sample = rows.find((row) => !row.classList.contains('panelActive')) ?? rows[0]
      const header = ensureHeader(nav, sample)

      const pinnedSet = new Set(state.pinned.filter((label) => labels.includes(label)))
      const pinnedOrder = new Map()
      state.pinned.forEach((label, index) => {
        if (!pinnedOrder.has(label)) pinnedOrder.set(label, index)
      })

      rows.forEach((row, index) => {
        const label = labels[index]
        const pinned = pinnedSet.has(label)
        row.setAttribute(ATTR_ZONE, pinned ? 'pinned' : 'tools')
        row.draggable = true
        const order = pinned ? ORDER_PINNED + (pinnedOrder.get(label) ?? index) : ORDER_TOOLS + index
        row.style.order = String(order)
      })

      header.style.order = String(ORDER_HEADER)
      const other = Array.from(nav.children).find((child) => child !== header && !isRow(child))
      if (other instanceof HTMLElement) other.style.order = String(ORDER_OTHER)

      updateHeader(header, rows.length - pinnedSet.size, state.collapsed)

      header.hidden = rail
      if (rail) nav.removeAttribute(ATTR_COLLAPSED)
      else nav.toggleAttribute(ATTR_COLLAPSED, state.collapsed)
    }

    /** 插入（或复用）「工具」行，并从真实行抄一份类名以继承外壳样式。 */
    function ensureHeader(nav, sample) {
      let header = nav.querySelector(`[${ATTR_HEADER}]`)
      if (header === null) {
        header = document.createElement('button')
        header.type = 'button'
        header.setAttribute(ATTR_HEADER, '')
        header.innerHTML =
          `<span class="dsh-fold-icon" aria-hidden="true">${ICON_CUBE}</span>` +
          '<span class="dsh-fold-title"></span>' +
          '<span class="dsh-fold-count"></span>' +
          `<span class="dsh-fold-chevron" aria-hidden="true">${ICON_CHEVRON}</span>`
        header.addEventListener('click', onHeaderClick)
        nav.append(header)
      }
      const base = sample.className
        .split(/\s+/)
        .filter((name) => name.length > 0 && !name.includes('panelActive'))
        .join(' ')
      if (header.dataset.foldBase !== base) {
        header.dataset.foldBase = base
        header.className = `${base} dsh-fold-header`
      }
      return header
    }

    /** 同步「工具」行的文案与无障碍属性。 */
    function updateHeader(header, count, collapsed) {
      const copy = strings()
      header.setAttribute('aria-expanded', String(!collapsed))
      header.setAttribute(
        'aria-label',
        `${copy.group}（${count} 个入口，${collapsed ? copy.collapsed : copy.expanded}）`,
      )
      const title = header.querySelector('.dsh-fold-title')
      if (title !== null) title.textContent = copy.group
      const badge = header.querySelector('.dsh-fold-count')
      if (badge !== null) badge.textContent = String(count)
    }

    /** 点「工具」行：收起 / 展开。 */
    function onHeaderClick(event) {
      event.preventDefault()
      event.stopPropagation()
      state.collapsed = !state.collapsed
      saveState()
      render()
    }

    // ------------------------------------------------------------------ 拖动

    /** 事件目标所在的真实面板行（可能是行里的 span / svg）。 */
    function closestRow(target) {
      if (!(target instanceof Element)) return null
      const row = target.closest(SELECTOR_ROW)
      return row instanceof HTMLElement ? row : null
    }

    /** 拖动落点：要么是「工具」行，要么是某个面板行。 */
    function dropTarget(target, nav) {
      if (!(target instanceof Element)) return null
      const header = target.closest(`[${ATTR_HEADER}]`)
      if (header instanceof HTMLElement && nav.contains(header)) return header
      const row = closestRow(target)
      if (row !== null && nav.contains(row)) return row
      return null
    }

    /** 高亮当前落点（每个导航区只保留一个）。 */
    function highlight(nav, target) {
      Array.from(nav.children).forEach((child) => {
        if (child instanceof HTMLElement && child !== target) child.removeAttribute(ATTR_DROP)
      })
      target.setAttribute(ATTR_DROP, '')
    }

    /** 清掉拖动过程中的所有标记。 */
    function clearMarks(nav) {
      Array.from(nav.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return
        child.removeAttribute(ATTR_DROP)
        child.removeAttribute(ATTR_DRAGGING)
      })
    }

    function onDragStart(event) {
      const nav = panelNav()
      if (nav === null) return
      const row = closestRow(event.target)
      if (row === null || !nav.contains(row) || row.hasAttribute(ATTR_HEADER)) return
      dragLabel = labelOf(row)
      row.setAttribute(ATTR_DRAGGING, '')
      try {
        event.dataTransfer?.setData('text/plain', dragLabel)
        if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = 'move'
      } catch {
        /* ignore */
      }
    }

    function onDragOver(event) {
      if (dragLabel === null) return
      const nav = panelNav()
      if (nav === null) return
      const target = dropTarget(event.target, nav)
      if (target === null) return
      event.preventDefault()
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
      highlight(nav, target)
    }

    function onDrop(event) {
      const label = dragLabel
      if (label === null) return
      const nav = panelNav()
      if (nav === null) return
      const target = dropTarget(event.target, nav)
      if (target === null) return
      event.preventDefault()
      dragLabel = null
      clearMarks(nav)
      const droppedOnHeader = target.hasAttribute(ATTR_HEADER)
      const droppedOnTools = target.getAttribute(ATTR_ZONE) === 'tools'
      if (droppedOnHeader || droppedOnTools) moveToTools(label)
      else moveToPinned(label, labelOf(target))
      saveState()
      render()
    }

    function onDragEnd() {
      dragLabel = null
      const nav = panelNav()
      if (nav !== null) clearMarks(nav)
    }

    /** 把一行收进工具组（从常驻列表里移除）。 */
    function moveToTools(label) {
      if (state.pinned === null) return
      state.pinned = state.pinned.filter((item) => item !== label)
    }

    /**
     * 把一行固定到常驻区。
     * @param label - 要移动的行。
     * @param beforeLabel - 插到这一行前面；为空或找不到时追加到末尾。
     */
    function moveToPinned(label, beforeLabel) {
      if (beforeLabel === label) return
      const pinned = (state.pinned ?? []).filter((item) => item !== label)
      let index = beforeLabel === null ? -1 : pinned.indexOf(beforeLabel)
      if (index < 0) index = pinned.length
      pinned.splice(index, 0, label)
      state.pinned = pinned
    }

    // ------------------------------------------------------------------ 右键菜单

    function onContextMenu(event) {
      const nav = panelNav()
      if (nav === null) return
      const row = closestRow(event.target)
      if (row === null || !nav.contains(row) || row.hasAttribute(ATTR_HEADER)) return
      event.preventDefault()
      openMenu(row, event.clientX, event.clientY)
    }

    /** 右键菜单：拖动之外的显式移动入口。 */
    function openMenu(row, x, y) {
      closeMenu()
      const label = labelOf(row)
      const pinned = row.getAttribute(ATTR_ZONE) === 'pinned'
      const box = document.createElement('div')
      box.className = 'dsh-fold-menu'
      box.setAttribute('role', 'menu')
      const item = document.createElement('button')
      item.type = 'button'
      item.setAttribute('role', 'menuitem')
      const copy = strings()
      item.textContent = pinned ? copy.moveIn : copy.pin
      item.addEventListener('click', () => {
        if (pinned) moveToTools(label)
        else moveToPinned(label, null)
        saveState()
        render()
        closeMenu()
      })
      box.append(item)
      box.style.left = `${Math.min(x, Math.max(8, window.innerWidth - 200))}px`
      box.style.top = `${Math.min(y, Math.max(8, window.innerHeight - 64))}px`
      document.body.append(box)
      menuElement = box
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
      document.addEventListener('keydown', onDocumentKeyDown, true)
      window.addEventListener('blur', closeMenu, true)
    }

    function onDocumentPointerDown(event) {
      if (menuElement !== null && event.target instanceof Node && menuElement.contains(event.target)) return
      closeMenu()
    }

    function onDocumentKeyDown(event) {
      if (event.key === 'Escape') closeMenu()
    }

    function closeMenu() {
      if (menuElement === null) return
      menuElement.remove()
      menuElement = null
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
      document.removeEventListener('keydown', onDocumentKeyDown, true)
      window.removeEventListener('blur', closeMenu, true)
    }

    // ------------------------------------------------------------------ 生命周期

    function installStyles() {
      if (document.querySelector(SELECTOR_STYLE) !== null) return
      const style = document.createElement('style')
      style.setAttribute('data-dsh-fold-style', '')
      style.textContent = CSS
      document.head.append(style)
    }

    /** 挂载：观察 DOM 变化（React 重渲染 / 侧栏折叠），自愈并清理。 */
    function mount() {
      loadState()
      installStyles()

      // 合并短时间内的多次 DOM 变化：rAF 优先，超时兜底。
      // 只用 rAF 不够稳——后台标签页、隐藏窗口或无合成器的环境里 rAF 可能不推进，
      // 那样 React 重建导航后「工具」行就补不回来。
      let frame = 0
      let timer = 0
      const run = () => {
        if (frame !== 0) window.cancelAnimationFrame(frame)
        if (timer !== 0) window.clearTimeout(timer)
        frame = 0
        timer = 0
        render()
      }
      const schedule = () => {
        if (frame !== 0 || timer !== 0) return
        frame = window.requestAnimationFrame(run)
        timer = window.setTimeout(run, 80)
      }
      const observer = new MutationObserver(schedule)
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      })

      document.addEventListener('dragstart', onDragStart, true)
      document.addEventListener('dragover', onDragOver, true)
      document.addEventListener('drop', onDrop, true)
      document.addEventListener('dragend', onDragEnd, true)
      document.addEventListener('contextmenu', onContextMenu, true)

      render()

      return function dispose() {
        observer.disconnect()
        if (frame !== 0) window.cancelAnimationFrame(frame)
        if (timer !== 0) window.clearTimeout(timer)
        document.removeEventListener('dragstart', onDragStart, true)
        document.removeEventListener('dragover', onDragOver, true)
        document.removeEventListener('drop', onDrop, true)
        document.removeEventListener('dragend', onDragEnd, true)
        document.removeEventListener('contextmenu', onContextMenu, true)
        closeMenu()
        document.querySelectorAll(`[${ATTR_HEADER}]`).forEach((node) => node.remove())
        document.querySelectorAll(`[${ATTR_NAV}]`).forEach((nav) => {
          nav.removeAttribute(ATTR_NAV)
          nav.removeAttribute(ATTR_COLLAPSED)
        })
        document.querySelectorAll(`[${ATTR_ZONE}]`).forEach((row) => {
          row.removeAttribute(ATTR_ZONE)
          row.removeAttribute(ATTR_DROP)
          row.removeAttribute(ATTR_DRAGGING)
          if (row instanceof HTMLElement) {
            row.style.order = ''
            row.draggable = false
          }
        })
        document.querySelector(SELECTOR_STYLE)?.remove()
        lastSignature = ''
        window.__dshSidebarFoldDispose = undefined
        window.__dshSidebarFoldDebug = undefined
      }
    }

    /** 只在本地（含 file://）暴露调试/自测句柄。 */
    function installDebug() {
      const location = window.location
      const host = location?.hostname ?? ''
      if (host === 'localhost' || host === '127.0.0.1' || location?.protocol === 'file:') {
        window.__dshSidebarFoldDebug = {
          version: VERSION,
          state: () => ({ collapsed: state.collapsed, pinned: state.pinned === null ? null : state.pinned.slice() }),
          render,
          reset: () => {
            state.collapsed = true
            state.pinned = null
            saveState()
            render()
          },
          dispose: () => window.__dshSidebarFoldDispose?.(),
        }
      }
    }

    /**
     * 客户端入口（Cordis 插件 apply）。
     * @param ctx - 客户端上下文；只用可选的 effect 注册清理。
     */
    function apply(ctx) {
      try {
        window.__dshSidebarFoldDispose?.()
        installDebug()
        const dispose = mount()
        window.__dshSidebarFoldDispose = dispose
        if (typeof ctx?.effect === 'function') {
          ctx.effect(() => dispose, 'dsh-sidebar-groups: sidebar groups')
        }
      } catch (error) {
        // Web shell 在插件 apply 抛错时会中断启动：这里只记录，不外抛。
        console.error('[dsh-sidebar-groups] mount failed', error)
      }
    }

    exports.name = 'dsh-sidebar-groups'
    exports.inject = []
    exports.apply = apply
    return module.exports
  },
})
