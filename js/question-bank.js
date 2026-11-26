/* Question Banks page: paper list -> banks for that paper.
 * Data comes from window.CA_PAPERS (data/papers.js). Needs js/core.js loaded first. */
(function () {
  "use strict";

  var el = CAT.el;
  var root = document.getElementById("qb-root");
  var papers = window.CA_PAPERS || [];
  var exists = {}; // file -> true/false

  // Is the PDF uploaded yet?
  function check(file) {
    if (file in exists) return Promise.resolve(exists[file]);
    return fetch(file, { method: "HEAD", cache: "no-cache" })
      .then(function (r) {
        var type = r.headers.get("content-type") || "";
        exists[file] = r.ok && type.indexOf("text/html") === -1; // ignore HTML 404 pages
        return exists[file];
      })
      .catch(function () { exists[file] = false; return false; });
  }

  function bankRow(bank) {
    var info = el("div", { class: "grow" }, [el("div", { class: "title", text: bank.title })]);
    if (bank.note) info.append(el("div", { class: "meta", text: bank.note }));
    var row = el("div", { class: "row" }, [info, el("span", { class: "badge", text: "Checking…" })]);

    check(bank.file).then(function (ok) {
      var badge = el("span", { class: "badge", text: ok ? "Open" : "Not uploaded yet" });
      if (ok) {
        var link = el("a", { class: "row", href: bank.file, target: "_blank", rel: "noopener" }, [info, badge]);
        row.replaceWith(link);
      } else {
        row.title = "Upload as: " + bank.file;
        row.replaceChildren(info, badge);
      }
    });
    return row;
  }

  function showPaper(paper) {
    var crumbs = el("div", { class: "crumbs" }, [
      el("a", { href: "#", text: "Question Banks", onclick: function (e) { e.preventDefault(); showList(); } }),
      el("span", { text: "›" }),
      el("span", { text: paper.code })
    ]);
    var banks = paper.banks || [];
    root.replaceChildren(
      crumbs,
      el("h1", { text: paper.name }),
      el("p", { class: "sub", text: paper.type ? paper.type + " paper" : "" }),
      banks.length
        ? el("div", { class: "list" }, banks.map(bankRow))
        : el("div", { class: "empty", text: "No banks listed for this paper yet." })
    );
    window.scrollTo(0, 0);
  }

  function paperRow(paper) {
    var count = (paper.banks || []).length;
    return el("button", { class: "row", onclick: function () { showPaper(paper); } }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title", text: paper.code + " · " + paper.name }),
        el("div", { class: "meta", text: (paper.type || "") + (paper.type ? " · " : "") + count + (count === 1 ? " bank" : " banks") })
      ]),
      el("span", { class: "badge", text: "›" })
    ]);
  }

  function showList() {
    root.replaceChildren(
      el("h1", { text: "Question Banks" }),
      el("p", { class: "sub", text: "Pick a paper to see its question banks." }),
      papers.length
        ? el("div", { class: "list" }, papers.map(paperRow))
        : el("div", { class: "empty" }, [document.createTextNode("No papers found. Check "), el("code", { text: "data/papers.js" })])
    );
    window.scrollTo(0, 0);
  }

  showList();
})();
