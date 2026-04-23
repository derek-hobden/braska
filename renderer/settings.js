// Settings panel module
// Extracted from monolithic renderer — manages the settings view,
// skills panel, and agents panel.

import { tabState } from './state.js';
import { agentDisplayName, escHtml } from './utils.js';

// ---------------------------------------------------------------------------
// Lazy imports — resolved after all modules have loaded to avoid circular deps
// ---------------------------------------------------------------------------
let _openWorkDir = null;
let _setBreadcrumb = null;

export function bindSettingsDeps({ openWorkDir, setBreadcrumb }) {
  _openWorkDir = openWorkDir;
  _setBreadcrumb = setBreadcrumb;
}

// ---------------------------------------------------------------------------
// DOM refs (queried once at init time)
// ---------------------------------------------------------------------------
let settingsBtn;
let settingsView;
let backBtn;
let sidebarHeader;
let sidebarFooter;
let mainPanel;
let settingsPanel;
let settingsPanelTitle;
let settingsPanelBody;
let settingsPanelAddBtn;
let settingsMenu;
let projectList;
let launchpad;
let terminalView;

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------
let activeSection = null;
let savedActiveTabId = null;
let savedActiveWorkDir = null;

// ---------------------------------------------------------------------------
// Core settings functions
// ---------------------------------------------------------------------------
export function enterSettings() {
  savedActiveTabId = tabState.activeTabId;
  savedActiveWorkDir = tabState.activeWorkDir;
  tabState.activeTabId = null;
  window.browserView.setActive(null);
  sidebarHeader.style.display = 'none';
  projectList.style.display = 'none';
  sidebarFooter.style.display = 'none';
  settingsView.classList.add('active');
  mainPanel.style.display = 'none';
  launchpad.classList.remove('active');
  terminalView.classList.remove('active');
  settingsPanel.classList.add('active');
  if (!activeSection) openSection('skills');
}

export function exitSettings() {
  settingsView.classList.remove('active');
  sidebarHeader.style.display = '';
  projectList.style.display = '';
  sidebarFooter.style.display = '';
  settingsPanel.classList.remove('active');
  activeSection = null;
  settingsMenu.querySelectorAll('.settings-menu-item').forEach(b => b.classList.remove('active'));

  if (savedActiveWorkDir) {
    tabState.activeTabId = savedActiveTabId;
    _openWorkDir(savedActiveWorkDir);
  } else {
    _setBreadcrumb(null);
    mainPanel.style.display = '';
  }
  savedActiveTabId = null;
  savedActiveWorkDir = null;
}

// ---------------------------------------------------------------------------
// Section switching
// ---------------------------------------------------------------------------
function openSection(section) {
  activeSection = section;
  settingsMenu.querySelectorAll('.settings-menu-item').forEach(b => {
    b.classList.toggle('active', b.dataset.section === section);
  });
  settingsPanelAddBtn.style.display = 'none';
  settingsPanelAddBtn.onclick = null;

  if (section === 'skills') {
    settingsPanelTitle.textContent = 'Skills';
    settingsPanelAddBtn.style.display = '';
    settingsPanelAddBtn.onclick = () => showSkillForm('', '');
    loadSkillsPanel();
  } else if (section === 'agents') {
    settingsPanelTitle.textContent = 'Agents';
    loadAgentsPanel();
  } else if (section === 'mcp-servers') {
    settingsPanelTitle.textContent = 'MCP Servers';
    settingsPanelBody.innerHTML = '<div class="settings-empty">No MCP servers configured</div>';
  }
}

// ---------------------------------------------------------------------------
// Skills panel
// ---------------------------------------------------------------------------
async function loadSkillsPanel() {
  const skills = await window.skills.list();
  renderSkillsList(skills);
}

function renderSkillsList(skills) {
  const listHtml = skills.length === 0
    ? '<div class="settings-empty">No skills configured</div>'
    : skills.map(s => {
        const esc = s.name.replace(/"/g, '&quot;');
        return `<div class="skill-item" data-name="${esc}">
          <span class="skill-name">${s.name}</span>
          <button class="skill-remove-btn" data-remove="${esc}" title="Remove skill">&times;</button>
        </div>`;
      }).join('');
  settingsPanelBody.innerHTML = `<div id="skills-list">${listHtml}</div><div id="skill-form-container"></div>`;
}

function showSkillForm(name, content) {
  const container = document.getElementById('skill-form-container');
  if (!container) return;
  const isEdit = name !== '';
  const nameEsc = name.replace(/"/g, '&quot;');
  const contentEsc = (content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  container.innerHTML = `<div class="skill-form">
    <input type="text" id="skill-name-input" placeholder="Skill name" value="${nameEsc}" ${isEdit ? 'readonly style="opacity:0.6;cursor:default"' : ''} />
    <textarea id="skill-content-input" placeholder="Skill prompt / instructions">${contentEsc}</textarea>
    <div class="skill-form-actions">
      <button id="skill-cancel-btn">Cancel</button>
      <button id="skill-save-btn" class="save-btn">Save</button>
    </div>
  </div>`;
  document.getElementById('skill-cancel-btn').addEventListener('click', () => { container.innerHTML = ''; });
  document.getElementById('skill-save-btn').addEventListener('click', async () => {
    const n = document.getElementById('skill-name-input').value.trim();
    const c = document.getElementById('skill-content-input').value;
    if (!n) return;
    const skills = await window.skills.save(n, c);
    container.innerHTML = '';
    renderSkillsList(skills);
  });
  document.getElementById(isEdit ? 'skill-content-input' : 'skill-name-input').focus();
}

// ---------------------------------------------------------------------------
// Agents panel (read-only view — CRUD via /agents command in a Claude tab)
// ---------------------------------------------------------------------------
async function loadAgentsPanel() {
  const agents = await window.agents.list();
  const listHtml = agents.length === 0
    ? '<div class="settings-empty">No agents configured</div>'
    : agents.map(a => {
        const desc = a.description ? `<span class="agent-description">${escHtml(a.description)}</span>` : '';
        const badge = a.builtin ? '<span class="agent-badge">builtin</span>' : '';
        return `<div class="agent-item">
          <span class="agent-name">${escHtml(agentDisplayName(a.name))}</span>${badge}${desc}
        </div>`;
      }).join('');
  settingsPanelBody.innerHTML = `<div id="agents-list">${listHtml}</div>
    <div class="agents-hint">Agents are stored in <code>~/.claude/agents/</code>. Use the <strong>/agents</strong> command in any Claude tab to create, edit, or remove agents.</div>`;
}

// ---------------------------------------------------------------------------
// Delegated click handler for settings panel body
// ---------------------------------------------------------------------------
function onSettingsPanelBodyClick(e) {
  // Skills
  const skillRemoveBtn = e.target.closest('.skill-remove-btn');
  if (skillRemoveBtn) {
    window.skills.remove(skillRemoveBtn.dataset.remove).then(skills => {
      renderSkillsList(skills);
    }).catch(err => console.error('[Braska]', err));
    return;
  }
  const skillItem = e.target.closest('.skill-item');
  if (skillItem) {
    window.skills.list().then(all => {
      const skill = all.find(s => s.name === skillItem.dataset.name);
      if (skill) showSkillForm(skill.name, skill.content);
    }).catch(err => console.error('[Braska]', err));
    return;
  }
  // Agents panel is read-only — no click handlers needed
}

// ---------------------------------------------------------------------------
// Initialization — call once after DOM is ready
// ---------------------------------------------------------------------------
export function initSettings() {
  settingsBtn = document.getElementById('settings-btn');
  settingsView = document.getElementById('settings-view');
  backBtn = document.getElementById('back-btn');
  sidebarHeader = document.getElementById('sidebar-header');
  sidebarFooter = document.getElementById('sidebar-footer');
  mainPanel = document.getElementById('main');
  settingsPanel = document.getElementById('settings-panel');
  settingsPanelTitle = document.getElementById('settings-panel-title');
  settingsPanelBody = document.getElementById('settings-panel-body');
  settingsPanelAddBtn = document.getElementById('settings-panel-add-btn');
  settingsMenu = document.getElementById('settings-menu');
  projectList = document.getElementById('project-list');
  launchpad = document.getElementById('launchpad');
  terminalView = document.getElementById('terminal-view');

  settingsBtn.addEventListener('click', enterSettings);
  backBtn.addEventListener('click', exitSettings);
  settingsMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('.settings-menu-item');
    if (btn) openSection(btn.dataset.section);
  });
  settingsPanelBody.addEventListener('click', onSettingsPanelBodyClick);
}
