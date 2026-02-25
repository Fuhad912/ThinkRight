(function () {
  "use strict";

  var DATA_URL = "data/jamb_insider.json";
  var SEARCH_DEBOUNCE_MS = 300;

  var state = {
    entries: [],
    filteredEntries: [],
    categories: [],
    activeCategory: "all",
    query: "",
    expandedId: null,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initInsiderPage);
  } else {
    initInsiderPage();
  }

  function initInsiderPage() {
    var root = document.getElementById("insiderRoot");
    if (!root) return;

    var ui = {
      searchInput: document.getElementById("insiderSearchInput"),
      chips: document.getElementById("insiderCategoryChips"),
      list: document.getElementById("insiderResults"),
      empty: document.getElementById("insiderEmptyState"),
      stats: document.getElementById("insiderStats"),
      updated: document.getElementById("insiderUpdated"),
    };

    if (!ui.searchInput || !ui.chips || !ui.list || !ui.empty || !ui.stats) {
      return;
    }

    attachHandlers(ui);
    loadData(ui);
  }

  function attachHandlers(ui) {
    var debouncedSearch = debounce(function (value) {
      state.query = normalize(value);
      applyFilters(ui);
    }, SEARCH_DEBOUNCE_MS);

    ui.searchInput.addEventListener("input", function (event) {
      debouncedSearch(event.target.value);
    });

    ui.searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        state.query = normalize(ui.searchInput.value);
        applyFilters(ui);
        expandFirstResult(ui);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        ui.searchInput.value = "";
        state.query = "";
        applyFilters(ui);
      }
    });

    ui.chips.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-category]");
      if (!button) return;

      var category = button.getAttribute("data-category") || "all";
      if (state.activeCategory === category) return;

      state.activeCategory = category;
      applyFilters(ui);
    });

    ui.list.addEventListener("click", function (event) {
      var toggle = event.target.closest("button[data-entry-id]");
      if (!toggle) return;

      var entryId = toggle.getAttribute("data-entry-id");
      if (!entryId) return;

      state.expandedId = state.expandedId === entryId ? null : entryId;
      renderEntries(ui);
    });
  }

  async function loadData(ui) {
    try {
      // To add more Insider entries, append objects to data/jamb_insider.json
      // using a unique "id" and valid "category", "title", and "content" fields.
      var response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load insider data");
      }

      var payload = await response.json();
      var list = Array.isArray(payload.entries) ? payload.entries : [];
      state.entries = dedupeEntries(list);

      if (ui.updated && payload.updated_at) {
        ui.updated.textContent = "Updated: " + payload.updated_at;
      }

      state.categories = collectCategories(state.entries);
      renderCategoryChips(ui);
      applyFilters(ui);
    } catch (error) {
      console.error("Insider data load error:", error);
      ui.stats.textContent = "Unable to load Insider content right now.";
      ui.empty.hidden = false;
      ui.list.textContent = "";
    }
  }

  function dedupeEntries(entries) {
    var seen = new Set();
    var clean = [];

    entries.forEach(function (entry) {
      if (!entry || typeof entry !== "object") return;

      var id = String(entry.id || "").trim();
      if (!id || seen.has(id)) return;

      seen.add(id);
      clean.push({
        id: id,
        category: String(entry.category || "General").trim(),
        title: String(entry.title || "Untitled").trim(),
        summary: String(entry.summary || "").trim(),
        tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
        content: Array.isArray(entry.content) ? entry.content.map(String) : [],
        note: entry.note ? String(entry.note) : "",
      });
    });

    return clean;
  }

  function collectCategories(entries) {
    var map = new Map();

    entries.forEach(function (entry) {
      var key = normalize(entry.category);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, entry.category);
      }
    });

    return Array.from(map.entries()).map(function (pair) {
      return { key: pair[0], label: pair[1] };
    });
  }

  function renderCategoryChips(ui) {
    ui.chips.textContent = "";

    var fragment = document.createDocumentFragment();
    fragment.appendChild(createChip("all", "All"));

    state.categories.forEach(function (category) {
      fragment.appendChild(createChip(category.key, category.label));
    });

    ui.chips.appendChild(fragment);
    syncActiveChip(ui);
  }

  function createChip(key, label) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "insider-chip";
    button.setAttribute("data-category", key);
    button.textContent = label;
    return button;
  }

  function syncActiveChip(ui) {
    var buttons = ui.chips.querySelectorAll("button[data-category]");
    buttons.forEach(function (button) {
      var active = button.getAttribute("data-category") === state.activeCategory;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyFilters(ui) {
    var q = state.query;
    var category = state.activeCategory;

    state.filteredEntries = state.entries.filter(function (entry) {
      if (category !== "all" && normalize(entry.category) !== category) {
        return false;
      }

      if (!q) return true;

      var haystack = [
        entry.title,
        entry.summary,
        entry.category,
        entry.note,
        entry.tags.join(" "),
        entry.content.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.indexOf(q) !== -1;
    });

    if (
      state.expandedId &&
      !state.filteredEntries.some(function (entry) {
        return entry.id === state.expandedId;
      })
    ) {
      state.expandedId = null;
    }

    syncActiveChip(ui);
    renderEntries(ui);
  }

  function renderEntries(ui) {
    ui.list.textContent = "";
    ui.empty.hidden = state.filteredEntries.length > 0;
    ui.stats.textContent = state.filteredEntries.length + " result" + (state.filteredEntries.length === 1 ? "" : "s");

    if (state.filteredEntries.length === 0) {
      return;
    }

    var fragment = document.createDocumentFragment();

    state.filteredEntries.forEach(function (entry) {
      var card = document.createElement("article");
      card.className = "insider-card";
      card.setAttribute("data-entry", entry.id);

      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "insider-card__toggle";
      toggle.setAttribute("data-entry-id", entry.id);

      var isExpanded = state.expandedId === entry.id;
      toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");

      var categoryTag = document.createElement("span");
      categoryTag.className = "insider-card__category";
      categoryTag.textContent = entry.category;

      var title = document.createElement("h3");
      title.className = "insider-card__title";
      appendHighlightedText(title, entry.title, state.query);

      var summary = document.createElement("p");
      summary.className = "insider-card__summary";
      appendHighlightedText(summary, entry.summary, state.query);

      var indicator = document.createElement("span");
      indicator.className = "insider-card__indicator";
      indicator.textContent = isExpanded ? "-" : "+";
      indicator.setAttribute("aria-hidden", "true");

      var head = document.createElement("div");
      head.className = "insider-card__head";
      head.appendChild(categoryTag);
      head.appendChild(title);
      head.appendChild(summary);

      toggle.appendChild(head);
      toggle.appendChild(indicator);

      var body = document.createElement("div");
      body.className = "insider-card__body";
      body.hidden = !isExpanded;

      if (entry.tags.length > 0) {
        var tagsWrap = document.createElement("div");
        tagsWrap.className = "insider-card__tags";

        entry.tags.forEach(function (tag) {
          var tagItem = document.createElement("span");
          tagItem.className = "insider-card__tag";
          appendHighlightedText(tagItem, "#" + tag, state.query);
          tagsWrap.appendChild(tagItem);
        });

        body.appendChild(tagsWrap);
      }

      if (entry.content.length > 0) {
        var list = document.createElement("ul");
        list.className = "insider-card__list";

        entry.content.forEach(function (line) {
          var li = document.createElement("li");
          appendHighlightedText(li, line, state.query);
          list.appendChild(li);
        });

        body.appendChild(list);
      }

      if (entry.note) {
        var note = document.createElement("p");
        note.className = "insider-card__note";
        appendHighlightedText(note, "Note: " + entry.note, state.query);
        body.appendChild(note);
      }

      card.appendChild(toggle);
      card.appendChild(body);
      fragment.appendChild(card);
    });

    ui.list.appendChild(fragment);
  }

  function expandFirstResult(ui) {
    if (state.filteredEntries.length === 0) return;
    state.expandedId = state.filteredEntries[0].id;
    renderEntries(ui);

    var firstButton = ui.list.querySelector("button[data-entry-id]");
    if (firstButton) {
      firstButton.focus();
      firstButton.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function appendHighlightedText(parent, text, query) {
    parent.textContent = "";

    var safeText = String(text || "");
    if (!query) {
      parent.appendChild(document.createTextNode(safeText));
      return;
    }

    var pattern = new RegExp("(" + escapeRegExp(query) + ")", "ig");
    var parts = safeText.split(pattern);

    parts.forEach(function (part) {
      if (!part) return;
      if (part.toLowerCase() === query.toLowerCase()) {
        var mark = document.createElement("mark");
        mark.textContent = part;
        parent.appendChild(mark);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function debounce(callback, waitMs) {
    var timeoutId = null;

    return function () {
      var args = arguments;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(function () {
        callback.apply(null, args);
      }, waitMs);
    };
  }
})();
