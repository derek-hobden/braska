# Claude CLI Code Review Integration

## Priority: High

## Description
When the user clicks the "Review" button in the Changes tab, it should trigger an actual code review via the Claude Code CLI using Claude's best model. The review process should provide visual feedback that a review is in progress, and the results should be displayed in a dedicated tab for the user to read.

Additionally, the review summary tab should include an "Implement Suggestions" button. When clicked, this button should prompt the user to select which expert they want to handle the work, then open a new tab with a pre-filled prompt to that expert along the lines of: "Take the necessary actions on the following feedback from code review: <review summary>".

## Tasks
- Trigger the Claude Code CLI from the Review button in the Changes tab, using Claude's best model
- Show a loading/progress indicator while the code review is running
- Display the review summary in a new tab (e.g. "Code Review" tab) once complete
- Add an "Implement Suggestions" button to the review summary tab
- When "Implement Suggestions" is clicked, prompt the user to choose an expert
- Open a new expert tab with a pre-filled prompt containing the review feedback for the selected expert to act on
