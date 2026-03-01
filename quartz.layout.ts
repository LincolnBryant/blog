import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

export const sortByDate = (a: any, b: any) => {
  // Access date from plugin data (assumes CreatedModifiedDate plugin is enabled)
  const dateA = a.dates?.modified || a.dates?.created || new Date(0)
  const dateB = b.dates?.modified || b.dates?.created || new Date(0)
  
  // Sort descending (newest first)
  return dateB.getTime() - dateA.getTime()
}

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
    Component.Comments({
      provider: 'giscus',
      options: {
        // from data-repo
        repo: 'lincolnbryant/blog',
        // from data-repo-id
        repoId: 'R_kgDOQu2jow',
        // from data-category
        category: 'Announcements',
        // from data-category-id
        categoryId: 'DIC_kwDOQu2jo84C0gzk',
        // from data-lang
        lang: 'en'
      }
    }),
  ],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/lincolnbryant",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
	Component.ConditionalRender({
      component: Component.ArticleTitle(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.RecentNotes()
  ],
  right: [
    Component.Graph(),
    Component.Explorer({ sortFn: sortByDate }),
    Component.Backlinks(),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer()
  ],
  right: [],
}
