// shared/utils/tabIconResolver.ts
export function getTabIcon(routeName: string, focused: boolean) {
  switch (routeName) {
    case "feed":
      return focused ? "home" : "home-outline";
    case "new":
      return focused ? "add-circle" : "add-circle-outline";
    case "profile":
      return focused ? "person-circle" : "person-circle-outline";
    default:
      return "ellipse-outline";
  }
}
