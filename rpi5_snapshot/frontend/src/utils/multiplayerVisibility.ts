type QuickMenuVisibility = {
  showInQuickMenu: boolean;
};

export function isQuickMenuGameVisible(game: QuickMenuVisibility) {
  return game.showInQuickMenu;
}
