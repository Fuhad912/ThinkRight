/*
 * ThinkRight Navbar Search
 * - Home: filters subject cards + keyword suggestions
 * - Syllabus: filters syllabus cards + keyword suggestions
 * - Desktop + mobile: same dropdown search row under navbar
 */
(function () {
  "use strict";

  var DEBOUNCE_MS = 300;
  var MAX_SUGGESTIONS = 8;
  var DEV_MODE =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.search.indexOf("debugSearch=1") !== -1;

  var STOPWORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "your",
    "you",
    "are",
    "was",
    "were",
    "have",
    "has",
    "about",
    "within",
    "under",
    "only",
    "not",
    "all",
    "can",
    "will",
    "show",
    "used",
    "use",
  ]);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavbarSearch);
  } else {
    initNavbarSearch();
  }

  function initNavbarSearch() {
    var isHome = document.body.classList.contains("page-home");
    var isSyllabus = document.body.classList.contains("page-syllabus");
    if (!isHome && !isSyllabus) return;

    var navbar = document.getElementById("tr-navbar");
    var container = navbar ? navbar.querySelector(".tr-navbar__container") : null;
    if (!navbar || !container) return;
    if (document.getElementById("tr-navbar-search-toggle")) return;

    var placeholder = isHome ? "Search subjects..." : "Search syllabus topics...";
    var ariaLabel = isHome ? "Search subjects" : "Search syllabus topics";
    var ui = buildSearchUi(navbar, container, placeholder, ariaLabel);
    if (!ui) return;

    var filterApi = isHome ? createHomeFilterApi() : createSyllabusFilterApi();
    if (!filterApi) return;

    var isOpen = false;
    var query = "";
    var debouncedApply = debounce(function (value, sourceInput) {
      filterApi.apply(value);
      renderSuggestionsForInput(sourceInput || ui.mobileInput, value);
    }, DEBOUNCE_MS);

    var inputs = [ui.mobileInput];
    if (filterApi.externalInput) {
      inputs.push(filterApi.externalInput);
    }

    inputs.forEach(function (input) {
      if (!input) return;
      var isNavInput = input === ui.mobileInput;

      input.addEventListener("focus", function () {
        if (isNavInput && !isOpen) {
          openSearch(false);
        }
        renderSuggestionsForInput(input, input.value);
      });

      input.addEventListener("input", function () {
        if (isNavInput && !isOpen) {
          openSearch(false);
        }
        applyQuery(input.value, input, false);
      });

      input.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeSearch({ clearQuery: true, restoreFocus: isNavInput });
          if (!isNavInput) {
            input.blur();
          }
          return;
        }

        if (event.key === "Enter") {
          // Enter commits filter only. No navigation.
          event.preventDefault();
          applyQuery(input.value, input, true);
          hideAllSuggestions();
        }
      });
    });

    ui.toggleButton.addEventListener("click", function () {
      if (isOpen) {
        closeSearch({ clearQuery: false, restoreFocus: false });
      } else {
        openSearch(true);
      }
    });

    document.addEventListener("click", function (event) {
      var clickedToggle = event.target.closest("#tr-navbar-search-toggle");
      var clickedRow = event.target.closest(".tr-navbar__search-mobile-row");
      var clickedSyllabusField = event.target.closest(".tr-syllabus-search-field");
      var clickedSuggestions = event.target.closest(".tr-search-suggestions");

      if (!clickedToggle && !clickedRow && !clickedSyllabusField && !clickedSuggestions) {
        hideAllSuggestions();
      }

      if (!isOpen) return;
      if (clickedToggle || clickedRow) return;
      closeSearch({ clearQuery: false, restoreFocus: false });
    });

    window.addEventListener(
      "resize",
      debounce(function () {
        if (!isOpen) return;
        focusSearchInput(false);
      }, 120)
    );

    applyQuery("", null, true);

    function applyQuery(value, sourceInput, immediate) {
      query = (value || "").toString();
      syncInputValues(query, sourceInput);
      if (immediate) {
        filterApi.apply(query);
        renderSuggestionsForInput(sourceInput || ui.mobileInput, query);
        return;
      }
      debouncedApply(query, sourceInput);
    }

    function syncInputValues(value, sourceInput) {
      inputs.forEach(function (input) {
        if (!input || input === sourceInput) return;
        if (input.value !== value) {
          input.value = value;
        }
      });
    }

    function getSuggestionContainer(input) {
      if (input && input === filterApi.externalInput && filterApi.externalSuggestionsEl) {
        return filterApi.externalSuggestionsEl;
      }
      return ui.suggestionsEl;
    }

    function renderSuggestionsForInput(input, rawValue) {
      var term = String(rawValue || "").trim().toLowerCase();
      var suggestions = term ? filterApi.getSuggestions(term) : [];
      var target = getSuggestionContainer(input);
      renderSuggestionList(target, suggestions, input);
      hideSuggestionsExcept(target);
    }

    function renderSuggestionList(container, suggestions, sourceInput) {
      if (!container) return;

      container.innerHTML = "";
      if (!suggestions || suggestions.length === 0) {
        container.hidden = true;
        return;
      }

      suggestions.slice(0, MAX_SUGGESTIONS).forEach(function (item) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "tr-search-suggestion";
        button.setAttribute("role", "option");
        button.textContent = item.label;

        button.addEventListener("click", function () {
          var nextQuery = item.value || item.label;
          applyQuery(nextQuery, sourceInput || ui.mobileInput, true);
          hideAllSuggestions();

          var targetInput = sourceInput || ui.mobileInput;
          if (targetInput) {
            targetInput.focus();
            var end = targetInput.value.length;
            targetInput.setSelectionRange(end, end);
          }
        });

        container.appendChild(button);
      });

      container.hidden = false;
    }

    function hideSuggestionsExcept(exception) {
      if (ui.suggestionsEl && ui.suggestionsEl !== exception) ui.suggestionsEl.hidden = true;
      if (
        filterApi.externalSuggestionsEl &&
        filterApi.externalSuggestionsEl !== exception
      ) {
        filterApi.externalSuggestionsEl.hidden = true;
      }
    }

    function hideAllSuggestions() {
      if (ui.suggestionsEl) ui.suggestionsEl.hidden = true;
      if (filterApi.externalSuggestionsEl) filterApi.externalSuggestionsEl.hidden = true;
    }

    function closeMobileMenuIfOpen() {
      var mobileMenu = document.getElementById("tr-mobile-menu");
      var hamburger = document.getElementById("tr-hamburger");
      if (mobileMenu && mobileMenu.classList.contains("open")) {
        mobileMenu.classList.remove("open");
        document.body.classList.remove("tr-menu-open");
      }
      if (hamburger) {
        hamburger.setAttribute("aria-expanded", "false");
      }
    }

    function focusSearchInput(selectAll) {
      var activeInput = ui.mobileInput;
      if (!activeInput) return;

      activeInput.focus({ preventScroll: false });
      if (selectAll) {
        activeInput.select();
      } else {
        var end = activeInput.value.length;
        activeInput.setSelectionRange(end, end);
      }
    }

    function openSearch(selectAll) {
      if (isOpen) {
        focusSearchInput(selectAll === true);
        return;
      }

      isOpen = true;
      closeMobileMenuIfOpen();
      navbar.classList.add("tr-navbar--search-open");
      ui.toggleButton.setAttribute("aria-expanded", "true");
      requestAnimationFrame(function () {
        focusSearchInput(selectAll === true);
      });
    }

    function closeSearch(options) {
      var opts = options || {};
      isOpen = false;
      navbar.classList.remove("tr-navbar--search-open");
      ui.toggleButton.setAttribute("aria-expanded", "false");
      hideAllSuggestions();

      if (opts.clearQuery) {
        applyQuery("", null, true);
      }
      if (opts.restoreFocus) {
        ui.toggleButton.focus();
      }
    }
  }

  function buildSearchUi(navbar, container, placeholder, ariaLabel) {
    var toggleButton = document.createElement("button");
    toggleButton.id = "tr-navbar-search-toggle";
    toggleButton.className = "tr-navbar__search-toggle";
    toggleButton.type = "button";
    toggleButton.setAttribute("aria-label", ariaLabel);
    toggleButton.setAttribute("aria-expanded", "false");
    toggleButton.setAttribute("aria-controls", "tr-navbar-search-mobile-row");

    var toggleIcon = document.createElement("span");
    toggleIcon.className = "tr-navbar__search-toggle-icon";
    toggleIcon.setAttribute("aria-hidden", "true");
    toggleIcon.appendChild(createSearchSvgIcon("tr-navbar__search-icon-svg"));
    toggleButton.appendChild(toggleIcon);

    var mobileRow = document.createElement("div");
    mobileRow.id = "tr-navbar-search-mobile-row";
    mobileRow.className = "tr-navbar__search-mobile-row";

    var mobileInner = document.createElement("div");
    mobileInner.className = "tr-navbar__search-mobile-inner";
    mobileRow.appendChild(mobileInner);

    var mobileField = document.createElement("label");
    mobileField.className = "tr-navbar__search-field";
    mobileField.setAttribute("for", "tr-navbar-search-input-mobile");
    mobileField.setAttribute("aria-label", ariaLabel);
    mobileInner.appendChild(mobileField);

    var mobileIcon = document.createElement("span");
    mobileIcon.className = "tr-navbar__search-field-icon";
    mobileIcon.setAttribute("aria-hidden", "true");
    mobileIcon.appendChild(createSearchSvgIcon("tr-navbar__search-icon-svg"));
    mobileField.appendChild(mobileIcon);

    var mobileInput = document.createElement("input");
    mobileInput.id = "tr-navbar-search-input-mobile";
    mobileInput.className = "tr-navbar__search-input";
    mobileInput.type = "search";
    mobileInput.placeholder = placeholder;
    mobileInput.autocomplete = "off";
    mobileInput.setAttribute("aria-label", ariaLabel);
    mobileField.appendChild(mobileInput);

    var suggestionsEl = document.createElement("div");
    suggestionsEl.id = "tr-navbar-search-suggestions";
    suggestionsEl.className = "tr-search-suggestions";
    suggestionsEl.hidden = true;
    suggestionsEl.setAttribute("role", "listbox");
    mobileInner.appendChild(suggestionsEl);

    var logo = container.querySelector(".tr-navbar__logo");
    if (logo && logo.parentNode === container) {
      if (logo.nextSibling) {
        container.insertBefore(toggleButton, logo.nextSibling);
      } else {
        container.appendChild(toggleButton);
      }
    } else {
      container.appendChild(toggleButton);
    }

    var mobileMenu = document.getElementById("tr-mobile-menu");
    if (mobileMenu) {
      navbar.insertBefore(mobileRow, mobileMenu);
    } else {
      navbar.appendChild(mobileRow);
    }

    return {
      toggleButton: toggleButton,
      mobileInput: mobileInput,
      suggestionsEl: suggestionsEl,
    };
  }

  function createHomeFilterApi() {
    var grid = document.querySelector(".subjects-grid");
    var cards = Array.prototype.slice.call(
      document.querySelectorAll(".subjects-grid .subject-card")
    );
    if (!grid || cards.length === 0) return null;

    var emptyState = document.getElementById("tr-home-search-empty");
    if (!emptyState) {
      emptyState = document.createElement("p");
      emptyState.id = "tr-home-search-empty";
      emptyState.className = "tr-search-empty";
      emptyState.textContent = "No subjects found.";
      emptyState.hidden = true;
      grid.insertAdjacentElement("afterend", emptyState);
    }

    var aliasMap = {
      english: ["use of english", "eng", "language"],
      mathematics: ["math", "maths"],
      government: ["gov", "goverment"],
      literature: ["literature in english", "lit"],
      crs: ["christian religious studies", "crk", "christian studies"],
      irs: ["islamic religious studies", "irk", "islamic studies"],
      agriculture: ["agricultural science", "agric"],
      computer: ["computer studies", "computer science", "ict"],
    };

    var subjects = cards.map(function (card) {
      var title = card.querySelector("h3");
      var label = title ? title.textContent.trim() : "";
      var key = (card.getAttribute("data-subject") || "").trim().toLowerCase();
      var aliases = aliasMap[key] || [];
      return {
        card: card,
        name: label,
        key: key,
        aliases: aliases,
        haystack: [label, key].concat(aliases).join(" ").toLowerCase(),
      };
    });

    var filteredSubjects = subjects.slice();

    return {
      externalInput: null,
      externalSuggestionsEl: null,
      apply: function (query) {
        var q = (query || "").trim().toLowerCase();
        filteredSubjects = !q
          ? subjects.slice()
          : subjects.filter(function (subject) {
              return subject.haystack.indexOf(q) !== -1;
            });

        grid.textContent = "";
        var fragment = document.createDocumentFragment();
        filteredSubjects.forEach(function (subject) {
          fragment.appendChild(subject.card);
        });
        grid.appendChild(fragment);

        emptyState.hidden = q === "" || filteredSubjects.length > 0;

        if (DEV_MODE) {
          console.log("query", q);
          console.log(
            "subjects count",
            subjects.length,
            "filtered count",
            filteredSubjects.length
          );
        }
      },
      getSuggestions: function (term) {
        var suggestions = [];
        var seen = new Set();

        subjects.forEach(function (subject) {
          if (subject.name.toLowerCase().indexOf(term) !== -1) {
            pushSuggestion(suggestions, seen, subject.name, subject.name, term, 0);
          }

          if (subject.key.indexOf(term) !== -1) {
            pushSuggestion(
              suggestions,
              seen,
              formatKeyword(subject.key),
              subject.key,
              term,
              1
            );
          }

          subject.aliases.forEach(function (alias) {
            if (alias.indexOf(term) !== -1) {
              pushSuggestion(
                suggestions,
                seen,
                formatKeyword(alias),
                alias,
                term,
                2
              );
            }
          });
        });

        return sortSuggestions(suggestions).slice(0, MAX_SUGGESTIONS);
      },
      getFirstMatch: function () {
        return filteredSubjects.length > 0 ? filteredSubjects[0].card : null;
      },
    };
  }

  function createSyllabusFilterApi() {
    var topInput = document.getElementById("tr-syllabus-topic-search");
    var emptyState = document.getElementById("tr-syllabus-search-empty");
    var suggestionsEl = document.getElementById("tr-syllabus-search-suggestions");
    var cards = Array.prototype.slice.call(document.querySelectorAll(".syllabus-item"));
    if (!topInput || !emptyState || cards.length === 0) return null;

    var index = cards.map(function (card) {
      var titleEl = card.querySelector("h3");
      var descEl = card.querySelector(".syllabus-description");
      var titleText = titleEl ? titleEl.textContent.trim() : "";
      var descText = descEl ? descEl.textContent.trim() : "";
      return {
        card: card,
        titleEl: titleEl,
        descEl: descEl,
        titleText: titleText,
        descText: descText,
        keywords: collectKeywords(titleText, descText),
        baseVisible: card.hidden !== true,
      };
    });

    return {
      externalInput: topInput,
      externalSuggestionsEl: suggestionsEl,
      apply: function (query) {
        var q = (query || "").trim().toLowerCase();
        var matchCount = 0;

        index.forEach(function (entry) {
          var haystack = (entry.titleText + " " + entry.descText).toLowerCase();
          var matches = q === "" || haystack.indexOf(q) !== -1;
          entry.card.hidden = !entry.baseVisible || !matches;

          if (entry.titleEl) {
            if (q) entry.titleEl.innerHTML = highlightText(entry.titleText, q);
            else entry.titleEl.textContent = entry.titleText;
          }

          if (entry.descEl) {
            if (q) entry.descEl.innerHTML = highlightText(entry.descText, q);
            else entry.descEl.textContent = entry.descText;
          }

          if (!entry.card.hidden) {
            matchCount += 1;
          }
        });

        emptyState.hidden = q === "" || matchCount > 0;
      },
      getSuggestions: function (term) {
        var suggestions = [];
        var seen = new Set();

        index.forEach(function (entry) {
          if (entry.titleText.toLowerCase().indexOf(term) !== -1) {
            pushSuggestion(
              suggestions,
              seen,
              entry.titleText,
              entry.titleText,
              term,
              0
            );
          }

          entry.keywords.forEach(function (keyword) {
            if (keyword.indexOf(term) !== -1) {
              pushSuggestion(
                suggestions,
                seen,
                formatKeyword(keyword),
                keyword,
                term,
                2
              );
            }
          });
        });

        return sortSuggestions(suggestions).slice(0, MAX_SUGGESTIONS);
      },
      getFirstMatch: function () {
        return null;
      },
    };
  }

  function collectKeywords(title, description) {
    var joined = ((title || "") + " " + (description || "")).toLowerCase();
    var words = joined.match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];
    var set = new Set();

    words.forEach(function (word) {
      if (!word || word.length < 3) return;
      if (STOPWORDS.has(word)) return;
      set.add(word);
    });

    var titlePhrase = (title || "").toLowerCase().trim();
    if (titlePhrase) set.add(titlePhrase);

    return Array.from(set);
  }

  function pushSuggestion(list, seen, label, value, term, priority) {
    var key = String(label || "").toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push({
      label: label,
      value: value,
      priority: priority,
      startsWith: key.indexOf(term) === 0,
    });
  }

  function sortSuggestions(items) {
    return items.sort(function (a, b) {
      if (a.startsWith !== b.startsWith) return a.startsWith ? -1 : 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return String(a.label).localeCompare(String(b.label));
    });
  }

  function formatKeyword(value) {
    var raw = String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return "";

    if (raw.length <= 4 && raw.indexOf(" ") === -1) {
      return raw.toUpperCase();
    }

    return raw
      .split(" ")
      .map(function (word) {
        if (!word) return "";
        if (word.length <= 3) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  function highlightText(text, query) {
    var safeText = escapeHtml(text || "");
    if (!query) return safeText;
    var pattern = new RegExp("(" + escapeRegExp(query) + ")", "gi");
    return safeText.replace(pattern, "<mark>$1</mark>");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function createSearchSvgIcon(className) {
    var svgNs = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    if (className) {
      svg.setAttribute("class", className);
    }

    var circle = document.createElementNS(svgNs, "circle");
    circle.setAttribute("cx", "11");
    circle.setAttribute("cy", "11");
    circle.setAttribute("r", "7");
    svg.appendChild(circle);

    var handle = document.createElementNS(svgNs, "line");
    handle.setAttribute("x1", "20");
    handle.setAttribute("y1", "20");
    handle.setAttribute("x2", "16.65");
    handle.setAttribute("y2", "16.65");
    svg.appendChild(handle);

    return svg;
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
