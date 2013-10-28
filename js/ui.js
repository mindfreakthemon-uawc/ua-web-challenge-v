jQuery(function ($) {
	"use strict";

	// compile templates
	var templates = {};
	$('.inline-template').each(function () {
		var $script = $(this);

		templates[$script.data('name')] = Handlebars.compile($script.html());
	});

	var $layers = $("#layers"),
		$ruler = $("#ruler"),
		$timeline = $("#timeline"),
		$queue = $("#queue"),
		$volume = $("#volume"),
		$seeker = $("#seeker"),
		$play = $("#play"),
		$pause = $("#pause"),
		$files = $("#files"),
		$locker = $("#locker"),
		$save = $("#save"),
		$load = $("#load"),
		$track_info = $("#track-info");

	$track_info
		.on('click', '.close', function () {
			$track_info.html('');
		})
		.on('change', '.track-fade', function (e) {
			var $self = $(e.target),
				track_id = $self.data('track-id');

			TimeLine.get(track_id).fade = e.target.value;
		})
		.on('click', '.track-remove', function (e) {
			var $self = $(e.currentTarget),
				track_id = $self.data('track-id');

			TimeLine.remove(track_id);

			$track_info.empty();
		});

	/* SAVING PROJECT */
	$save.on('click', function (e) {
		var array = [];

		TimeLine.tracks().forEach(function (t) {
			array.push(JSON.stringify(t.toObject()));
		});

		saveAs(new Blob([array.join('\n')]), 'project.nicy');
	});
	/* *** */

	/* LOADING PROJECT */
	$load.on('change', function (e) {
		var file = e.target.files[0];

		if (!file || !file.name.match(/\.nicy$/i)) {
			$load.val('');
			return;
		}

		// remove all current tracks
		TimeLine.tracks().forEach(function (t) {
			TimeLine.remove(t);
		});

		var fileReader = new FileReader();

		fileReader.addEventListener('load', function (e) {
			var array = fileReader.result.split('\n');

			array.forEach(function (s) {
				try {
					var track = JSON.parse(s);

					TimeLine.add(new TimeLine.Track(track));
				} catch (e) {}
			});
		});

		fileReader.readAsText(file);

		this.value = '';
	});
	/* *** */

	// load new tracks from local system
	$files.on('change', function (e) {
		Array.prototype.forEach.call(e.target.files, function (file) {
			TimeLine.add(new TimeLine.Track(file));
		});

		this.value = '';
	});

	// change current timeline position
	// also handle case while it's playing
	$ruler.on('click', function (e) {
		var playing = TimeLine.playing;

		if (playing) {
			TimeLine.pause();
		}

		TimeLine.position = ((e.offsetX || e.pageX - $ruler.offset().left) | 0) / TimeLine.zoom;

		if (playing) {
			TimeLine.play();
		}
	});

	$play.on('click', function () {
		TimeLine.play();
	});

	$pause.on('click', function () {
		TimeLine.pause();
	});

	TimeLine.on('play-state-changed', function () {
		var playing = TimeLine.playing;

		// disable/enable appropriate buttons
		$play[0].disabled = playing;
		$pause[0].disabled = !playing;
		$files[0].disabled = playing;

		// lock editor
		$locker.toggleClass('hidden', !playing);

		// clear info
		$track_info.empty();

		// remove all animations
		if (!playing) {
			$layers.children().stop(true, true).css({
				left: 0,
				opacity: 1
			});
		}
	});

	$volume
		.on('change', function () {
			var val = $volume.val();

			TimeLine.volume = val / 100;
		});

	TimeLine.on('volume-changed', function () {
		$volume.val(TimeLine.volume * 100);
	});

	$seeker
		.width(TimeLine.zoom)
		.draggable({
			axis: 'x',
			containment: 'parent',
			grid: [TimeLine.zoom, 0],
			drag: function (event, ui) {
				TimeLine.position = ui.position.left / TimeLine.zoom;
			}
		});

	TimeLine.on('position-changed', function () {
		var position = TimeLine.position;

		// move seek bar to appropriate place
		$seeker.css('left', position * TimeLine.zoom);

		// hide & show tracks according to new position
		TimeLine.tracks().forEach(function (t) {
			if (t.offset + t.start > position ||
				t.offset + t.end < position) {
				t.media.classList.add('hidden');
				return;
			}

			t.media.classList.remove('hidden');
		});
	});

	$timeline
		.sortable({
			items: '.track',
			handle: '.details',
			axis: 'y',
			appendTo: 'parent',
			stop: function (event, ui) {
				var track_id = ui.item.data('track-id'),
					// new track position
					position = $timeline.children('.track').index(ui.item);

				// cancel default move
				// because of programmatic
				$timeline.sortable('cancel');

				// trigger programmatic move
				TimeLine.move(track_id, position);
			}
		});

	function reorder_tracks() {
		var $tracks = $timeline.children('.track');

		// rearrange all. simple but expensive
		TimeLine.tracks().forEach(function (t) {
			$timeline.append($tracks.filter('[data-track-id="' + t.id + '"]'));
			// reverse z-ordering
			$layers.prepend(t.media);
		});
	}

	TimeLine.on('track-moved', reorder_tracks);

	TimeLine.on('track-removed', function (track) {
		var $track = $timeline.find('div.track[data-track-id="' + track.id + '"]'),
			$media = $(track.media);

		$media.remove();
		$track.remove();
	});

	TimeLine.on('track-inserted', function (track) {
		var html = templates.preloading_track({ track: track }),
			$preloading = $(html),
			$progress = $preloading.find('progress');

		$queue.append($preloading);

		// show progress bar of loading
		track.on('progress', function (e) {
			if (e.lengthComputable) {
				$progress.attr('value', 100 * e.loaded / e.total);
			}
		});

		// after track was loaded, place it onto the timeline
		track.on('load', function (e) {
			// remove queued html element
			$preloading.remove();

			var handle = function () {
				var position = TimeLine.position;

				if (track.offset + track.start > position ||
					track.offset + track.end < position) {
					// hide
					track.media.classList.add('hidden');
					return;
				}

				// show
				track.media.classList.remove('hidden');
			};

			// position changes
			track.on('offset-changed', handle);
			track.on('start-changed', handle);
			track.on('end-changed', handle);
			handle();

			// after media was started, show it
			// after pause or end - hide
			track.media.addEventListener('play', function () {
				if (TimeLine.playing) {
					track.media.classList.remove('hidden');
				}
			});

			track.media.addEventListener('pause', function () {
				if (TimeLine.playing) {
					track.media.classList.add('hidden');
				}
			});

			track.media.addEventListener('end', function () {
				if (TimeLine.playing) {
					track.media.classList.add('hidden');
				}
			});

			// construct track element for the timeline
			var $track = $(templates.timeline_track({ track: track })),
				$playable = $track.find('.playable'),
				$duration = $track.find('.duration')
					.width(track.duration * TimeLine.zoom);

			// while hovering, show some information
			// in a sidebar
			$track
				.on('click', function () {
					$track_info
						.html(templates.info_track({ track: track }))
						.find('.track-fade')
						.val(track.fade);
				});

			/* RESIZABLE START & END CHANGE */
			var resize_handle;

			if (track.type === 'image') {
				// different resize ui for an image
				$duration
					.resizable({
						handles: {
							e: $playable.find('.playable-right-bar')
						},
						minWidth: 3,
						containment: 'parent',
						grid: [TimeLine.zoom, 0],
						resize: function (event, ui) {
							track.end = ui.size.width / TimeLine.zoom;
						}
					})
					.width(track.end * TimeLine.zoom);

				resize_handle = function () {
					$duration.width(track.end * TimeLine.zoom);
				};

				track.on('end-changed', resize_handle);
				resize_handle();
			} else {
				$playable
					.resizable({
						handles: {
							w: $playable.find('.playable-left-bar'),
							e: $playable.find('.playable-right-bar')
						},
						minWidth: 3,
						containment: 'parent',
						grid: [TimeLine.zoom, 0],
						resize: function (event, ui) {
							var start = ui.position.left,
								end = start + ui.size.width;

							track.start = start / TimeLine.zoom;
							track.end = end / TimeLine.zoom;
						}
					});

				resize_handle = function () {
					$playable
						.css('left', track.start * TimeLine.zoom)
						.width((track.end - track.start) * TimeLine.zoom);
				};

				track.on('start-changed', resize_handle);
				track.on('end-changed', resize_handle);
				resize_handle();
			}
			/* *** */

			/* DRAGGABLE OFFSET CHANGE */
			$duration
				.draggable({
					axis: 'x',
					handle: '.movable',
					containment: 'parent',
					grid: [TimeLine.zoom, 0],
					drag: function (event, ui) {
						track.offset = ui.position.left / TimeLine.zoom;
					}
				});

			var offset_handler = function () {
				$duration
					.css('left', track.offset * TimeLine.zoom);
			};

			track.on('offset-changed', offset_handler);
			offset_handler();
			/* *** */

			// append to timeline
			$track.appendTo($timeline);
			reorder_tracks();
		});
	});

	// watching for each play cycle
	// and running effects when needed
	TimeLine.on('play-cycle', function (playing, paused) {
		playing.forEach(function (t) {
			// effects are not for an audio track
			if (t.type === 'audio') {
				return;
			}

			paused.some(function (k, i) {
				// effects are not for an audio track
				if (t.type === 'audio') {
					paused.splice(i, 1);
					return false;
				}

				if (t.offset + t.start < k.offset + k.start &&
					t.offset + t.end < k.offset + k.end) {

					var duration = (t.offset + t.end) - (k.offset + t.start);

					if (duration <= 1) {
						return;
					}

					switch (t.fade) {
						case 'slide-left':
							$(t.media).css('left', 0)
								.animate({
									left: '-100%'
								}, duration * 1000);

							$(k.media).css('left', '100%')
								.animate({
									left: '0'
								}, duration * 1000);
							break;
						case 'slide-right':
							$(t.media).css('left', 0)
								.animate({
									left: '100%'
								}, duration * 1000);

							$(k.media).css('left', '-100%')
								.animate({
									left: '0'
								}, duration * 1000);
							break;
						case 'opacity':
							$(t.media).css('opacity', 1)
								.animate({
									opacity: 0
								}, duration * 1000);

							$(k.media).css('opacity', 0)
								.animate({
									opacity: 1
								}, duration * 1000);
							break;
						default:
							return false;
					}

					// track used in effects, so remove it
					paused.splice(i, 1);
					return true;
				}

				return false;
			})
		});
	});
});
