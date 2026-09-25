import * as XLSX from "xlsx";

/**
 * Downloads the standardized Question Bank Excel template (.xlsx)
 * with sample questions, option columns, correct answers, and explanations.
 * Mentors and admins can use this to prepare and import new question banks.
 */
export const downloadQuestionBankTemplate = () => {
  const templateData = [
    {
      "Question": "What is the time complexity of searching an element in a balanced Binary Search Tree (BST)?",
      "Option 1": "O(1)",
      "Option 2": "O(log n)",
      "Option 3": "O(n)",
      "Option 4": "O(n log n)",
      "Correct Option": "Option 2",
      "Explanation": "In a balanced BST, the height is O(log n), making search logarithmic.",
      "Image URL": "",
    },
    {
      "Question": "Which keyword in Python is used to define an asynchronous function?",
      "Option 1": "async",
      "Option 2": "await",
      "Option 3": "def async",
      "Option 4": "coroutine",
      "Correct Option": "Option 1",
      "Explanation": "In Python 3.5+, 'async def' defines native asynchronous coroutines.",
      "Image URL": "",
    },
    {
      "Question": "Which HTTP status code signifies an Internal Server Error?",
      "Option 1": "400",
      "Option 2": "404",
      "Option 3": "500",
      "Option 4": "503",
      "Correct Option": "Option 3",
      "Explanation": "500 is the standard server error response for unhandled backend exceptions.",
      "Image URL": "",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);

  // Set column widths for readability
  ws["!cols"] = [
    { wch: 60 }, // Question
    { wch: 20 }, // Option 1
    { wch: 20 }, // Option 2
    { wch: 20 }, // Option 3
    { wch: 20 }, // Option 4
    { wch: 18 }, // Correct Option
    { wch: 45 }, // Explanation
    { wch: 25 }, // Image URL
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Question_Template");
  XLSX.writeFile(wb, "Question_Bank_Import_Template.xlsx");
};
