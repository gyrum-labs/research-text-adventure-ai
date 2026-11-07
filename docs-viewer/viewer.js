/*
 * docs-viewer
 *
 * Zero-build static documentation browser. Fetches _index.json for the tree
 * shape, renders a collapsible left sidebar, and loads the clicked file into
 * the right pane — markdown through marked + mermaid + highlight.js, known
 * source extensions through highlight.js, everything else as plain text.
 *
 * Design notes for future readers:
 *
 *   - No modules, no bundler. Target is modern evergreen browsers. Keeping the
 *     file vanilla means `bash serve.sh` and a browser are the entire toolchain
 *     — which is the whole point of a documentation viewer.
 *
 *   - Library availability is checked once at boot. If a library is missing,
 *     the viewer degrades rather than throws: markdown is escaped and shown as
 *     plain text, and the user gets a banner explaining how to vendor locally.
 *
 *   - Deep-linking is via location.hash so no router is needed.
 */

(function () {
  "use strict";

  var SOURCE_EXTS = {
    js: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    json: "json",
    sh: "bash",
    bash: "bash",
    yml: "yaml",
    yaml: "yaml",
    css: "css",
    html: "xml",
    xml: "xml",
    py: "python",
    go: "go",
    rs: "rust",
    toml: "ini",
  };

  var state = {
    root: "..",
    degraded: { marked: false, mermaid: false, hljs: false },
    tree: [],
    activePath: "",
    showingResults: false,
    searchIndex: null,
    searchPromise: null,
    searchIndexFailed: false,
    searchSeq: 0,
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      node.appendChild(c);
    });
    return node;
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showBanner(message) {
    var banner = document.getElementById("banner");
    banner.textContent = message;
    banner.hidden = false;
  }

  function detectDegradedMode() {
    if (typeof marked === "undefined") state.degraded.marked = true;
    if (typeof mermaid === "undefined") state.degraded.mermaid = true;
    if (typeof hljs === "undefined") state.degraded.hljs = true;

    var missing = Object.keys(state.degraded).filter(function (k) {
      return state.degraded[k];
    });
    if (missing.length > 0) {
      showBanner(
        "Offline mode: " +
          missing.join(", ") +
          " failed to load. Vendor local copies into lib/ — see docs-viewer/README.md for instructions.",
      );
    }
    if (!state.degraded.mermaid) {
      mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
    }
  }

  function buildTreeNode(node) {
    if (node.type === "file") {
      var link = el("a", { href: "#" + node.path, "data-path": node.path, text: node.name });
      link.addEventListener("click", function (event) {
        event.preventDefault();
        loadFile(node.path);
      });
      return el("li", { class: "file" }, [link]);
    }
    // Folders start COLLAPSED (warp#16326 reader UI): a 1000+ file tree is a
    // wall of text when fully expanded. The root level is opened by
    // renderTree, deeper folders open on click, and revealPath() opens the
    // ancestors of the active document so deep-links never land on a hidden
    // entry.
    var toggle = el("span", { class: "dir-toggle", text: node.name });
    var ul = el("ul", null, (node.children || []).map(buildTreeNode));
    ul.style.display = "none";
    toggle.addEventListener("click", function () {
      var open = toggle.classList.toggle("open");
      ul.style.display = open ? "" : "none";
    });
    return el("li", { class: "dir" }, [toggle, ul]);
  }

  function renderTree(tree) {
    var container = document.getElementById("tree");
    container.innerHTML = "";
    var ul = el("ul", null, tree.map(buildTreeNode));
    container.appendChild(ul);
    // The root level (just "docs") starts open so the reader sees the
    // top-level sections; everything deeper stays collapsed.
    container.querySelectorAll(":scope > ul > li.dir").forEach(function (li) {
      var t = li.querySelector(":scope > .dir-toggle");
      var sub = li.querySelector(":scope > ul");
      if (t && sub) {
        t.classList.add("open");
        sub.style.display = "";
      }
    });
  }

  // Expand every ancestor folder of the active document and bring its link
  // into view — deep-links and search-result clicks must never land on an
  // entry hidden inside a collapsed folder.
  function revealPath(path) {
    var link = document.querySelector('#tree a[data-path="' + CSS.escape(path) + '"]');
    if (!link) return;
    var node = link.parentElement;
    while (node && node.id !== "tree") {
      if (node.tagName === "UL") {
        node.style.display = "";
        var parentLi = node.parentElement;
        if (parentLi && parentLi.classList && parentLi.classList.contains("dir")) {
          var t = parentLi.querySelector(":scope > .dir-toggle");
          if (t) t.classList.add("open");
        }
      }
      node = node.parentElement;
    }
    if (link.scrollIntoView) link.scrollIntoView({ block: "nearest" });
  }

  function markActive(path) {
    document.querySelectorAll("#tree a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-path") === path);
    });
  }

  // ── Search (warp#16326) ─────────────────────────────────────────────
  // Two modes share one box. Filename mode filters the already-rendered
  // tree in place (no fetch, instant). Full-text mode lazy-fetches
  // _search.json — generated by update-docs.sh — on first use, ranks
  // matches, and renders clickable snippets into the sidebar. Clearing
  // the box always restores the full tree. A missing index degrades to a
  // plain message, matching the viewer's degrade-don't-throw rule.

  function filterTree(query) {
    var filtering = query.length > 0;
    var files = document.querySelectorAll("#tree li.file");
    files.forEach(function (li) {
      var a = li.querySelector("a");
      var hit = a.getAttribute("data-path").toLowerCase().indexOf(query) !== -1;
      li.style.display = hit ? "" : "none";
    });
    // Collapse dirs whose subtree has no visible file. querySelectorAll is
    // document order, so reversed() processes children before their parents.
    var dirs = Array.prototype.slice.call(document.querySelectorAll("#tree li.dir")).reverse();
    dirs.forEach(function (li) {
      var kids = li.querySelectorAll(":scope > ul > li");
      var anyVisible = Array.prototype.some.call(kids, function (k) {
        return k.style.display !== "none";
      });
      li.style.display = anyVisible ? "" : "none";
      // While filtering, force matching dirs open — with folders collapsed
      // by default a hidden match is a lost match.
      if (filtering && anyVisible) {
        var t = li.querySelector(":scope > .dir-toggle");
        var sub = li.querySelector(":scope > ul");
        if (t) t.classList.add("open");
        if (sub) sub.style.display = "";
      }
    });
  }

  function ensureSearchIndex() {
    if (state.searchIndex) return Promise.resolve(state.searchIndex);
    if (state.searchIndexFailed) return Promise.reject(new Error("unavailable"));
    if (state.searchPromise) return state.searchPromise;
    state.searchPromise = import("./search-index.js")
      .then(function (reader) { return reader.loadSearchIndex(state.tree); })
      .then(function (data) {
        state.searchIndex = data;
        return data;
      })
      .catch(function (err) {
        state.searchIndexFailed = true;
        throw err;
      });
    return state.searchPromise;
  }

  function snippetFor(text, q) {
    var idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return "";
    var start = Math.max(0, idx - 60);
    var end = Math.min(text.length, idx + q.length + 60);
    return (
      (start > 0 ? "…" : "") +
      text.slice(start, end).replace(/\s+/g, " ").trim() +
      (end < text.length ? "…" : "")
    );
  }

  function highlightTerm(text, q) {
    if (!q) return escapeHtml(text);
    var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    return escapeHtml(text).replace(re, function (m) {
      return "<mark>" + m + "</mark>";
    });
  }

  function renderSearchResults(query) {
    var container = document.getElementById("tree");
    var q = query.toLowerCase();
    // Sequence guard: fetches resolve out of order under fast typing, so only
    // the latest call may touch the DOM — anything older is a stale render.
    var seq = ++state.searchSeq;
    ensureSearchIndex()
      .then(function (index) {
        if (seq !== state.searchSeq) return;
        var scored = [];
        index.forEach(function (entry) {
          var text = (entry.text || "").toLowerCase();
          var count = 0;
          var pos = 0;
          while ((pos = text.indexOf(q, pos)) !== -1) {
            count++;
            pos += q.length;
          }
          var pathHit = entry.path.toLowerCase().indexOf(q) !== -1;
          if (count > 0 || pathHit) {
            scored.push({ entry: entry, score: (pathHit ? 1000 : 0) + count });
          }
        });
        scored.sort(function (a, b) {
          return b.score - a.score;
        });
        var top = scored.slice(0, 50);
        container.innerHTML = "";
        if (top.length === 0) {
          container.appendChild(
            el("p", { class: "search-empty", text: "No matches for “" + query + "”." }),
          );
          return;
        }
        var ul = el("ul", { class: "search-results" });
        top.forEach(function (s) {
          var link = el("a", { href: "#" + s.entry.path, "data-path": s.entry.path, text: s.entry.path });
          link.addEventListener("click", function (event) {
            event.preventDefault();
            loadFile(s.entry.path);
          });
          var snip = el("div", { class: "search-snippet" });
          snip.innerHTML = highlightTerm(snippetFor(s.entry.text || "", q) || "(path match)", q);
          ul.appendChild(el("li", null, [link, snip]));
        });
        container.appendChild(ul);
      })
      .catch(function () {
        if (seq !== state.searchSeq) return;
        container.innerHTML = "";
        container.appendChild(
          el("p", {
            class: "search-empty",
            text: "Full-text index not available — run scripts/update-docs.sh to generate _search.json.",
          }),
        );
      });
  }

  function initSearch() {
    var box = document.getElementById("search");
    var mode = document.getElementById("search-mode");
    if (!box || !mode) return;
    var timer = null;
    function apply() {
      // Any new input invalidates in-flight search renders (see the
      // sequence guard in renderSearchResults).
      state.searchSeq++;
      var q = box.value.trim();
      if (!q) {
        // Fresh render restores the collapsed-by-default tree; re-reveal the
        // open document so the reader keeps their place.
        state.showingResults = false;
        renderTree(state.tree);
        if (state.activePath) {
          markActive(state.activePath);
          revealPath(state.activePath);
        }
        return;
      }
      if (mode.value === "fulltext") {
        // q was trimmed above; fold internal whitespace to match the compact index.
        q = q.replace(/\s+/g, " ");
        if (q.length < 2) {
          // Below the search floor: restore the tree rather than leaving the
          // previous query's results up as stale output.
          if (state.showingResults) {
            state.showingResults = false;
            renderTree(state.tree);
            if (state.activePath) {
              markActive(state.activePath);
              revealPath(state.activePath);
            }
          }
          return;
        }
        state.showingResults = true;
        renderSearchResults(q);
      } else {
        if (state.showingResults) {
          renderTree(state.tree);
          state.showingResults = false;
        }
        filterTree(q.toLowerCase());
      }
    }
    box.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(apply, 200);
    });
    mode.addEventListener("change", apply);
  }

  function extOf(path) {
    var idx = path.lastIndexOf(".");
    return idx >= 0 ? path.slice(idx + 1).toLowerCase() : "";
  }

  function renderMarkdown(text, content) {
    if (state.degraded.marked) {
      content.innerHTML = "<pre>" + escapeHtml(text) + "</pre>";
      return;
    }
    var inner = el("div", { class: "inner" });
    inner.innerHTML = marked.parse(text);
    content.innerHTML = "";
    content.appendChild(inner);
    applyMermaid(inner);
    applyHighlight(inner);
  }

  function applyMermaid(root) {
    if (state.degraded.mermaid) return;
    // marked renders fenced `mermaid` blocks as <pre><code class="language-mermaid">.
    // Mermaid wants bare <div class="mermaid"> elements with the source as text,
    // so swap the nodes before running mermaid.
    var blocks = root.querySelectorAll("pre code.language-mermaid");
    blocks.forEach(function (code) {
      var div = document.createElement("div");
      div.className = "mermaid";
      div.textContent = code.textContent;
      code.parentNode.parentNode.replaceChild(div, code.parentNode);
    });
    var diagrams = root.querySelectorAll(".mermaid");
    if (diagrams.length > 0) {
      mermaid.run({ nodes: diagrams }).catch(function (err) {
        console.error("mermaid render failed", err);
      });
    }
  }

  function applyHighlight(root) {
    if (state.degraded.hljs) return;
    root.querySelectorAll("pre code").forEach(function (code) {
      if (!code.className.includes("language-mermaid")) {
        hljs.highlightElement(code);
      }
    });
  }

  function renderSource(text, lang, content) {
    var pre = el("pre");
    var code = el("code", lang ? { class: "language-" + lang } : null);
    code.textContent = text;
    pre.appendChild(code);
    content.innerHTML = "";
    content.appendChild(pre);
    if (!state.degraded.hljs) hljs.highlightElement(code);
  }

  function renderError(message, content) {
    content.innerHTML = "";
    content.appendChild(el("div", { class: "error", text: message }));
  }

  function loadFile(path) {
    var content = document.getElementById("content");
    var url = state.root.replace(/\/$/, "") + "/" + path;
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " fetching " + url);
        return res.text();
      })
      .then(function (text) {
        var ext = extOf(path);
        if (ext === "md" || ext === "markdown") {
          renderMarkdown(text, content);
        } else if (SOURCE_EXTS[ext]) {
          renderSource(text, SOURCE_EXTS[ext], content);
        } else {
          renderSource(text, null, content);
        }
        document.getElementById("path").textContent = path;
        state.activePath = path;
        markActive(path);
        revealPath(path);
        if (window.location.hash.slice(1) !== path) {
          window.location.hash = "#" + path;
        }
      })
      .catch(function (err) {
        renderError("Failed to load " + path + ": " + err.message, content);
      });
  }

  function renderMissingIndex(err) {
    var content = document.getElementById("content");
    content.innerHTML = "";
    var inner = el("div", { class: "inner" });
    inner.innerHTML =
      "<h2>Index not found</h2>" +
      "<p>The viewer could not load <code>_index.json</code>: " +
      escapeHtml(err.message) +
      ".</p>" +
      "<p>This file lists the documentation tree the viewer renders. In a project " +
      "bootstrapped by <code>gyrum-setup</code>, it is regenerated by " +
      "<code>scripts/update-docs.sh</code> (planned: PR 3 of the devtools repo). " +
      "Until that script ships, a baseline <code>_index.json</code> is committed " +
      "alongside the viewer template.</p>";
    content.appendChild(inner);
  }

  function boot() {
    detectDegradedMode();
    fetch("_index.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data.root) state.root = data.root;
        state.tree = data.tree || [];
        renderTree(state.tree);
        initSearch();
        var initial = window.location.hash.slice(1);
        if (initial) loadFile(initial);
      })
      .catch(renderMissingIndex);
  }

  window.addEventListener("hashchange", function () {
    var path = window.location.hash.slice(1);
    if (path) loadFile(path);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
