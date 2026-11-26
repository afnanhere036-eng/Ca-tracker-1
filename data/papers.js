/* Paper list for the Question Banks page.
 *
 * HOW TO ADD CONTENT LATER
 *  1. Create a folder named  question-banks  in the repo root.
 *  2. Upload each PDF there using EXACTLY the file name shown below
 *     (for example  question-banks/paper1-accounting-qb.pdf).
 *  3. Commit. The page automatically shows "Open" once the file exists.
 *
 * To rename a paper or a file, just change the text here.
 * To add another bank for a paper, add a line to its  banks  list.
 */
function banksFor(slug) {
  return [
    { title: "Question Bank",        note: "Chapter-wise practice questions", file: "question-banks/" + slug + "-qb.pdf" },
    { title: "Previous Year Papers", note: "Past exam papers with answers",   file: "question-banks/" + slug + "-pyq.pdf" },
    { title: "Mock Test Papers",     note: "Full-length mock tests",          file: "question-banks/" + slug + "-mock.pdf" },
    { title: "Revision Test Papers", note: "Last-minute revision sets",       file: "question-banks/" + slug + "-rtp.pdf" }
  ];
}

window.CA_PAPERS = [
  {
    id: "p1",
    code: "Paper 1",
    name: "Principles and Practice of Accounting",
    type: "Subjective",
    banks: banksFor("paper1-accounting")
  },
  {
    id: "p2",
    code: "Paper 2",
    name: "Business Laws",
    type: "Subjective",
    banks: banksFor("paper2-business-laws")
  },
  {
    id: "p3",
    code: "Paper 3",
    name: "Business Mathematics, Logical Reasoning and Statistics",
    type: "Objective",
    banks: banksFor("paper3-quantitative-aptitude")
  },
  {
    id: "p4",
    code: "Paper 4",
    name: "Business Economics and Business and Commercial Knowledge",
    type: "Objective",
    banks: banksFor("paper4-economics-bck")
  }
];
