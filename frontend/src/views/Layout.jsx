import { AWS_FFMPEG_ENDPOINT, AWS_HLS_INGEST_ENDPOINT } from "@/constants";
import {
  AppLayout,
  BreadcrumbGroup,
  ContentLayout,
  Flashbar,
  SideNavigation,
} from "@cloudscape-design/components";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import Header from "@/components/Header";
import { useState } from "react";
import useStore from "@/stores/useStore";

const Layout = () => {
  const [navigationOpen, setNavigationOpen] = useState(true);
  const alertItems = useStore((state) => state.alertItems);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const followLink = (e) => {
    e.preventDefault();
    navigate(e.detail.href);
  };

  const breadCrumbs = () => {
    let breadCrumbPath = pathname;
    if (
      breadCrumbPath.startsWith("/player") ||
      breadCrumbPath.startsWith("/diagram")
    ) {
      const splitPath = pathname.split("/").filter((p) => p !== "");
      splitPath.push(splitPath.splice(0, 1)[0]);
      breadCrumbPath = "/" + splitPath.join("/");
    }
    const hrefs = breadCrumbPath
      .split("/")
      .slice(1)
      .reduce(
        (allPaths, subPath) => {
          const lastPath = allPaths[allPaths.length - 1];
          allPaths.push(
            lastPath.endsWith("/")
              ? lastPath + subPath
              : `${lastPath}/${subPath}`
          );
          return allPaths;
        },
        ["/"]
      );
    return hrefs.map((href) => ({
      text: href === "/" ? "home" : href.split("/").at(-1),
      href,
    }));
  };

  return (
    <>
      <Header />
      <AppLayout
        notifications={<Flashbar items={alertItems} stackItems />}
        breadcrumbs={
          <BreadcrumbGroup onFollow={followLink} items={breadCrumbs()} />
        }
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        navigation={
          <SideNavigation
            onFollow={followLink}
            items={[
              {
                type: "section",
                text: "TAMS",
                items: [
                  { type: "link", text: "Sources", href: "/sources" },
                  { type: "link", text: "Flows", href: "/flows" },
                ],
              },
              AWS_HLS_INGEST_ENDPOINT
                ? {
                    type: "section",
                    text: "Ingest",
                    items: [
                      {
                        type: "link",
                        text: "MediaLive Channels",
                        href: "/channels",
                      },
                      {
                        type: "link",
                        text: "MediaConvert Jobs",
                        href: "/jobs",
                      },
                      {
                        type: "link",
                        text: "HLS Ingests",
                        href: "/workflows",
                      },
                    ],
                  }
                : {},
              AWS_FFMPEG_ENDPOINT
                ? {
                    type: "section",
                    text: "FFmpeg",
                    items: [
                      {
                        type: "link",
                        text: "Export",
                        href: "/ffmpeg-exports",
                      },
                      {
                        type: "link",
                        text: "Rules",
                        href: "/ffmpeg-rules",
                      },
                      {
                        type: "link",
                        text: "Jobs",
                        href: "/ffmpeg-jobs",
                      },
                    ],
                  }
                : {},
            ]}
          />
        }
        toolsHide
        content={
          <ContentLayout disableOverlap>
            <Outlet />
          </ContentLayout>
        }
      />
    </>
  );
};

export default Layout;
