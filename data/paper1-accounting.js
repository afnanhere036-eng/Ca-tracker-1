/* Paper 1: Accounting  -  upload your questions here.
   Chapters: copy the chapter block, change id (no spaces) and title.
   Question types:
     MCQ:         { type: "mcq", question: "...", options: ["A","B","C","D"], answer: 0, explanation: "..." }
                  (answer = position of the right option, starting from 0)
     Descriptive: { type: "descriptive", question: "...", answer: "...", marks: 5 }          */
QB.register("paper1", {
  chapters: [
    {
      id: "ch1",
      title: "Chapter 1 (rename me)",
      questions: [
        // Sample question - delete or replace
        { type: "mcq", question: "Sample: Which of these is an asset?", options: ["Creditors", "Cash in hand", "Capital", "Loan taken"], answer: 1, explanation: "Cash in hand is a resource owned by the business." }
      ]
    },
    { id: "ch2", title: "Chapter 2 (rename me)", questions: [] }
  ]
});
