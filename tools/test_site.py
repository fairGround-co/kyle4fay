"""Static integrity tests for kyle4fay HTML pages and image assets.

Run with standard library unittest (no third-party packages required):

    python -B -m unittest discover -s tools
"""
import hashlib
from html.parser import HTMLParser
import pathlib
import struct
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
MISSPELLED_LISSA_KELLY_SHA256 = (
    "774e3ade176bed30f500156549fe244f55506f5ffa376ada69ce0d9cc8b885b0"
)
CORRECTED_LISSA_KELLY_SHA256 = (
    "410bda0e4a6ae6a3ed709bdf96f81bfaff6ca50f854743e304d55f7fac7140c2"
)

SOF_MARKERS = {
    0xC0, 0xC1, 0xC2, 0xC3,
    0xC5, 0xC6, 0xC7,
    0xC9, 0xCA, 0xCB,
    0xCD, 0xCE, 0xCF,
}


def read_image_dimensions(path: pathlib.Path) -> tuple[int, int]:
    """Return (width, height) for PNG or JPEG files using stdlib only."""
    data = path.read_bytes()
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        width, height = struct.unpack(">II", data[16:24])
        return width, height

    if data.startswith(b"\xff\xd8"):
        idx = 2
        n = len(data)
        while idx < n:
            while idx < n and data[idx] == 0xFF:
                idx += 1
            if idx >= n:
                break
            marker = data[idx]
            idx += 1
            if marker == 0xD9 or marker == 0xDA:
                break
            if marker == 0x01 or 0xD0 <= marker <= 0xD8:
                continue
            seg_len = struct.unpack(">H", data[idx:idx + 2])[0]
            if marker in SOF_MARKERS:
                height, width = struct.unpack(">HH", data[idx + 3:idx + 7])
                return width, height
            idx += seg_len

    raise ValueError(f"Unsupported or malformed image file: {path}")


class ImageTagCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.images: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "img":
            self.images.append({k: (v or "") for k, v in attrs})


class EndorsementCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tile_images: dict[str, str] = {}
        self.article_images: dict[str, str] = {}
        self._current_tile_id: str | None = None
        self._current_article_id: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        d = {k: (v or "") for k, v in attrs}
        classes = set(d.get("class", "").split())
        if tag == "a" and "endorse-tile" in classes:
            href = d.get("href", "")
            if href.startswith("endorsements.html#"):
                self._current_tile_id = href.split("#", 1)[1]
        elif tag == "article" and "endorsement" in classes and d.get("id"):
            self._current_article_id = d["id"]
            self.article_images.setdefault(self._current_article_id, "")
        elif tag == "img":
            if self._current_tile_id is not None:
                self.tile_images[self._current_tile_id] = d.get("src", "")
            if self._current_article_id is not None and not self.article_images[self._current_article_id]:
                self.article_images[self._current_article_id] = d.get("src", "")

    def handle_endtag(self, tag: str) -> None:
        if tag == "a":
            self._current_tile_id = None
        elif tag == "article":
            self._current_article_id = None


class SiteAssetTests(unittest.TestCase):
    def test_local_images_exist_and_match_declared_dimensions(self) -> None:
        html_files = sorted(ROOT.glob("*.html"))
        self.assertTrue(html_files, "Expected root HTML files")
        for html_file in html_files:
            collector = ImageTagCollector()
            collector.feed(html_file.read_text(encoding="utf-8"))
            for img in collector.images:
                src = img.get("src", "")
                if not src or src.startswith(("http://", "https://", "data:")):
                    continue
                asset_path = ROOT / src.lstrip("/")
                self.assertTrue(
                    asset_path.is_file(),
                    f"{html_file.name} references missing image {src}",
                )
                if ("width" in img or "height" in img) and asset_path.suffix.lower() in {
                    ".jpg", ".jpeg", ".png"
                }:
                    actual_w, actual_h = read_image_dimensions(asset_path)
                    self.assertEqual(
                        (img.get("width"), img.get("height")),
                        (str(actual_w), str(actual_h)),
                        f"{html_file.name} {src} declared ({img.get('width')}, {img.get('height')}) "
                        f"!= actual ({actual_w}, {actual_h})",
                    )

    def test_homepage_endorsement_tiles_match_endorsements_page(self) -> None:
        home = EndorsementCollector()
        home.feed((ROOT / "index.html").read_text(encoding="utf-8"))
        page = EndorsementCollector()
        page.feed((ROOT / "endorsements.html").read_text(encoding="utf-8"))

        self.assertTrue(home.tile_images, "Expected endorsement tiles on index.html")
        for slug, tile_src in home.tile_images.items():
            self.assertIn(
                slug,
                page.article_images,
                f"index.html tile #{slug} missing matching article on endorsements.html",
            )
            self.assertEqual(
                tile_src,
                page.article_images[slug],
                f"Image mismatch for endorsement #{slug}",
            )

    def test_lissa_kelly_graphic_is_corrected_asset(self) -> None:
        graphic = ROOT / "images" / "endorsements" / "lissa-kelly.jpg"
        digest = hashlib.sha256(graphic.read_bytes()).hexdigest()
        self.assertNotEqual(
            digest,
            MISSPELLED_LISSA_KELLY_SHA256,
            "lissa-kelly.jpg still matches the old misspelled 'Lyssa Kelly' graphic",
        )
        self.assertEqual(digest, CORRECTED_LISSA_KELLY_SHA256)
        self.assertEqual(read_image_dimensions(graphic), (819, 1024))


if __name__ == "__main__":
    unittest.main()
