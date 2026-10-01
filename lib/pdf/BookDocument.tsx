import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { documentFor, defaultAppearance, papers } from "../document/rich";
import { pdfDate, pageSizes } from "./options";
import { fontStack } from "./fonts";
import type { PdfJob } from "./types";
const style = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontFamily: "WaffleSerif",
    color: "#352d25",
  },
  running: {
    position: "absolute",
    top: 23,
    left: 48,
    right: 48,
    fontFamily: "WaffleSans",
    fontSize: 7,
    color: "#7f7366",
    letterSpacing: 1,
  },
  footer: {
    position: "absolute",
    bottom: 23,
    left: 48,
    right: 48,
    fontFamily: "WaffleSans",
    fontSize: 8,
    lineHeight: 1,
    height: 12,
    color: "#7f7366",
    textAlign: "center",
  },
  date: {
    marginBottom: 24,
    borderBottomWidth: 0.5,
    borderBottomColor: "#c9b79c",
    paddingBottom: 15,
  },
  dateYear: {
    fontFamily: "WaffleSans",
    fontSize: 8,
    letterSpacing: 2,
    marginBottom: 10,
    color: "#7f7366",
  },
  photo: { marginTop: 18, marginBottom: 12 },
  caption: {
    fontFamily: "WaffleSans",
    fontSize: 9,
    lineHeight: 1.4,
    marginTop: 9,
    color: "#65584a",
  },
});
export function BookDocument({ entries, options }: PdfJob) {
  const { height, width } = pageSizes[options.size];
  return (
    <Document
      title={options.title}
      subject={options.subtitle || "A personal journal"}
      creator="Waffle"
      producer="Waffle"
      language="en-NZ"
      pageLayout="twoPageRight"
    >
      {options.cover && (
        <Page
          size={[width, height]}
          style={{
            ...style.page,
            backgroundColor: options.colours ? "#f5eddd" : "#ffffff",
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 26,
              left: 26,
              right: 26,
              bottom: 26,
              borderWidth: 1,
              borderColor: "#b59a72",
            }}
          />
          <View style={{ marginTop: height * 0.09, alignItems: "center" }}>
            <Text
              style={{
                fontFamily: "WaffleSans",
                fontSize: 9,
                letterSpacing: 3,
                color: "#806340",
                marginBottom: 30,
              }}
            >
              A WAFFLE JOURNAL
            </Text>
            <Text
              style={{
                fontFamily: fontStack("serif"),
                fontSize:
                  options.title.length > 70
                    ? 18
                    : options.title.length > 40
                      ? 23
                      : 32,
                lineHeight: 1.3,
                textAlign: "center",
                marginBottom: 22,
              }}
            >
              {options.title}
            </Text>
            {!!options.subtitle.trim() && (
              <Text
                style={{
                  fontFamily: fontStack("serif"),
                  fontStyle: "italic",
                  fontSize: 10,
                  lineHeight: 1.5,
                  textAlign: "center",
                  marginBottom: 20,
                }}
              >
                {options.subtitle}
              </Text>
            )}
            <View
              style={{
                height: 1,
                width: 42,
                backgroundColor: "#b59a72",
                marginTop: 10,
                marginBottom: 24,
              }}
            />
            <Text
              style={{
                fontFamily: "WaffleSans",
                fontSize: 8,
                textAlign: "center",
                lineHeight: 1.8,
                color: "#806340",
              }}
            >
              {pdfDate(options.from)}
              {options.from === options.to ? "" : `\n—\n${pdfDate(options.to)}`}
            </Text>
          </View>
          <Text style={{ ...style.footer, letterSpacing: 1, bottom: 43 }}>
            ONE DAY AT A TIME
          </Text>
        </Page>
      )}
      {entries.map((entry) => {
        const appearance = entry.appearance || defaultAppearance;
        const family = fontStack(
          options.font === "entry" ? appearance.font : options.font,
        );
        const colour = options.colours
          ? papers[appearance.paper]
          : { paper: "#ffffff", ink: "#352d25" };
        return (
          <Page
            key={entry.date}
            size={[width, height]}
            style={{
              ...style.page,
              backgroundColor: colour.paper,
              color: colour.ink,
              fontFamily: family,
              fontSize: options.textSize,
              lineHeight: 1.55,
            }}
          >
            <Text fixed style={style.running}>
              {pdfDate(entry.date)} / WAFFLE
            </Text>
            {appearance.showDate && (
              <View style={style.date} minPresenceAhead={options.textSize * 3}>
                <Text style={style.dateYear}>
                  {pdfDate(entry.date, { year: "numeric" })}
                </Text>
                <Text
                  style={{
                    fontSize: 22,
                    lineHeight: 1.3,
                    textDecoration: appearance.dateUnderline
                      ? "underline"
                      : "none",
                  }}
                >
                  {pdfDate(entry.date, { weekday: "long" })}
                </Text>
                <Text style={{ fontSize: 12, marginTop: 3 }}>
                  {pdfDate(entry.date, { day: "numeric", month: "long" })}
                </Text>
              </View>
            )}
            {documentFor(entry).content.map((block, i) => (
              <Text
                key={i}
                orphans={2}
                widows={2}
                minPresenceAhead={
                  block.type === "heading" ? options.textSize * 2 : 0
                }
                style={{
                  fontSize:
                    options.textSize +
                    (block.type === "heading"
                      ? block.attrs.level === 1
                        ? 4
                        : 2
                      : 0),
                  fontWeight: block.type === "heading" ? 700 : 400,
                  marginTop: block.type === "heading" ? 8 : 0,
                  lineHeight: 1.55,
                }}
              >
                {block.content?.length
                  ? block.content.map((n, j) =>
                      n.type === "hardBreak" ? (
                        "\n"
                      ) : (
                        <Text
                          key={j}
                          style={{
                            fontWeight: n.marks?.some((m) => m.type === "bold")
                              ? 700
                              : block.type === "heading"
                                ? 700
                                : 400,
                            fontStyle: n.marks?.some((m) => m.type === "italic")
                              ? "italic"
                              : "normal",
                            textDecoration: n.marks?.some(
                              (m) => m.type === "underline",
                            )
                              ? "underline"
                              : "none",
                          }}
                        >
                          {n.text}
                        </Text>
                      ),
                    )
                  : "\n"}
              </Text>
            ))}
            {options.photos &&
              entry.photos.map((photo) => {
                const imageWidth = width - 96;
                const imageHeight = Math.min(
                  options.size === "A5" ? 250 : 390,
                  (imageWidth * photo.height) / photo.width,
                );
                return (
                  <View key={photo.id} wrap={false} style={style.photo}>
                    <Image
                      src={photo.data}
                      style={{
                        width: imageWidth,
                        height: imageHeight,
                        objectFit: "contain",
                      }}
                    />
                    {!!photo.caption && (
                      <Text
                        style={{
                          ...style.caption,
                          fontFamily: fontStack("sans"),
                        }}
                      >
                        {photo.caption}
                      </Text>
                    )}
                  </View>
                );
              })}
            <View
              fixed
              style={{
                position: "absolute",
                top: height - 34,
                left: 48,
                right: 48,
              }}
            >
              <Text
                style={{
                  fontFamily: "WaffleSans",
                  fontWeight: 400,
                  fontStyle: "normal",
                  fontSize: 8,
                  lineHeight: 1.2,
                  textAlign: "center",
                  color: "#7f7366",
                }}
                render={({ pageNumber }) =>
                  String(pageNumber - (options.cover ? 1 : 0))
                }
              />
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
