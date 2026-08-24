from unittest.mock import MagicMock

import pytest
import watcher as watcher_module
from watcher import EventType, process_changes

from handler.scan_handler import ScanType

LIBRARY = "/romm/library"
METADATA_HANDLERS = (
    "meta_igdb_handler",
    "meta_ss_handler",
    "meta_moby_handler",
    "meta_ra_handler",
    "meta_launchbox_handler",
    "meta_hasheous_handler",
    "meta_playmatch_handler",
    "meta_sgdb_handler",
    "meta_flashpoint_handler",
    "meta_hltb_handler",
    "meta_tgdb_handler",
    "meta_libretro_handler",
)


@pytest.fixture
def enqueue(mocker):
    """`process_changes` with the scheduler, database and config stubbed."""
    mocker.patch.object(watcher_module, "ENABLE_RESCAN_ON_FILESYSTEM_CHANGE", True)
    mocker.patch.object(watcher_module, "LIBRARY_BASE_PATH", LIBRARY)

    config = MagicMock()
    config.has_structure_path_b = True
    config.EXCLUDED_SINGLE_FILES = []
    config.EXCLUDED_MULTI_FILES = []
    config.EXCLUDED_MULTI_PARTS_FILES = []
    mocker.patch.object(watcher_module.cm, "get_config", return_value=config)

    for name in METADATA_HANDLERS:
        handler = getattr(watcher_module, name)
        mocker.patch.object(
            handler, "is_enabled", return_value=name == "meta_igdb_handler"
        )

    mocker.patch.object(watcher_module, "get_pending_scan_jobs", return_value=[])
    mocker.patch.object(
        watcher_module.db_platform_handler,
        "get_platform_by_fs_slug",
        return_value=MagicMock(id=3),
    )
    return mocker.patch.object(watcher_module.tasks_scheduler, "enqueue_in")


def test_file_added_inside_a_game_folder_schedules_a_files_scan(enqueue):
    process_changes([(EventType.ADDED, f"{LIBRARY}/n64/roms/Game/hack/patched.ips")])

    enqueue.assert_called_once()
    kwargs = enqueue.call_args.kwargs
    assert kwargs["scan_type"] == ScanType.FILES
    assert kwargs["platform_ids"] == [3]
    assert kwargs["meta"]["task_name"] == "Files Scan"


def test_platform_folder_change_still_schedules_an_update_scan(enqueue):
    process_changes([(EventType.ADDED, f"{LIBRARY}/n64")])

    kwargs = enqueue.call_args.kwargs
    assert kwargs["scan_type"] == ScanType.UPDATE
    assert kwargs["platform_ids"] == []
