/**
 * Track object constructor
 * @param file
 * @constructor
 */
function Track(file) {
	// generating unique track id
	this._id = 'id' + Math.random() * 1000000;
	this._name = file.name;

	// start playing from
	// if this is an image offset is always zero
	this._offset = 0;
	// how much playing
	// must be lower that _length - _offset
	// or can be any number if this is an image
	this._duration = 0;

	// video's/image's width & height
	// always zero for an audio
	this._width = 0;
	this._height = 0;

	// video's/audio's slice fragment positions
	// not used with images
	this._start = 0;
	this._end = 0;

	this._type = null;

	// media element representing this track
	this._media = null;

	// fade effect
	this._fade = null;

	// loaded state
	this._loaded = false;

	// defining track type by mime type
	switch (true) {
		case Track.video.test(file.type):
			this._type = 'video';
			break;
		case Track.audio.test(file.type):
			this._type = 'audio';
			break;
		case Track.image.test(file.type):
			this._type = 'image';
			break;
		default:
			throw new Error('not supported type: ' + file.type);
	}

	// defaulted - if there's need to set
	// values to it's initial state
	var defaulted = true,
		loadready = function (src) {
		// saving data:
		this._data = src;

		// determining media params (duration, dimensions)
		var media;
		switch (this._type) {
			case 'video':
			case 'audio':
				media = document.createElement(this._type);
				media.src = this._data;
				media.loop = false;
				media.addEventListener('loadedmetadata', function () {
					this._duration = media.duration;

					if (defaulted) {
						this._end = media.duration;
					}

					if (this._type == 'video') {
						this._width = media.videoWidth;
						this._height = media.videoHeight;
					}

					this._loaded = true;
					this.emit('load');
				}.bind(this));
				media.load();

				break;
			case 'image':
				media = new Image();
				media.src = this._data;
				media.paused = true;
				media.addEventListener('load', function () {
					this._width = media.naturalWidth;
					this._height = media.naturalHeight;

					if (defaulted) {
						// default duration
						this._duration = this._end = 10;
					}

					this._loaded = true;
					this.emit('load');
				}.bind(this));
		}

		this._media = media;
	}.bind(this);

	if (file instanceof File) {
		var fileReader = new FileReader();

		// re-emit some events
		fileReader.addEventListener('error', this.emit.bind(this, 'error'));
		fileReader.addEventListener('abort', this.emit.bind(this, 'abort'));
		fileReader.addEventListener('progress', this.emit.bind(this, 'progress'));
		// emit successful load
		fileReader.addEventListener('load', function () {
			loadready(fileReader.result);
		});

		fileReader.readAsDataURL(file);
	} else {
		// remove defaulted mark
		// so we can override all fields
		defaulted = false;

		if (file.type === 'image') {
			this._duration = this._end = file.duration | 0;
		} else {
			this._start = file.start | 0;
			this._end = file.end | 0;
		}

		this._offset = file.offset | 0;
		this._fade = file.fade || null;

		loadready(file.data);
	}
}

Track.video = /video(?:\/.*)?/i;
Track.audio = /audio(?:\/.*)?/i;
Track.image = /image(?:\/.*)?/i;

Track.prototype = Object.create(EventEmitter.prototype, {
	name: {
		get: function () {
			return this._name;
		}
	},
	width: {
		get: function () {
			return this._width;
		}
	},
	height: {
		get: function () {
			return this._height;
		}
	},
	media: {
		get: function () {
			return this._media;
		}
	},
	duration: {
		get: function () {
			return this._duration;
		}
	},
	offset: {
		get: function () {
			return this._offset;
		},
		set: function (val) {
			this._offset = val;
			this.emit('offset-changed', val);
		}
	},
	start: {
		get: function () {
			return this._start;
		},
		set: function (val) {
			if (val > this._duration ||
				val < 0 || val > this._end) {
				return;
			}

			switch (this._type) {
				case 'video':
				case 'audio':
					this._start = val;
					this.emit('start-changed', val);
					break;
			}
		}
	},
	end: {
		get: function () {
			return this._end;
		},
		set: function (val) {
			switch (this._type) {
				case 'video':
				case 'audio':
					if (val > this._duration ||
						val < 0 || val < this._start) {
						return;
					}

					this._end = val;
					break;
				case 'image':
					if (val < 0) {
						return;
					}

					this._end = this._duration = val;
					break;
			}

			this.emit('end-changed', val);
		}
	},
	id: {
		get: function () {
			return this._id;
		}
	},
	type: {
		get: function () {
			return this._type;
		}
	},
	data: {
		get: function () {
			return this._data;
		}
	},
	fade: {
		get: function () {
			return this._fade;
		},
		set: function setter(val) {
			var vals = setter.vals || (setter.vals = ['slide-left', 'slide-right', 'opacity']);

			this._fade = vals.indexOf(val) === -1 ? null : val;

			this.emit('fade-changed', val);
		}
	},
	loaded: {
		get: function () {
			return this._loaded;
		}
	}
});

Track.prototype.toObject = function () {
	return {
		name: this.name,
		type: this.type,
		data: this.data,
		duration: this.duration,
		start: this.start,
		end: this.end,
		offset: this.offset,
		fade: this.fade
	};
};

/**
 * TimeLine singleton
 */
var TimeLine = Object.create(EventEmitter.prototype, {
	Track: {
		value: Track
	},

	// how one pixel relates to one second
	_zoom: {
		value: 2,
		writable: true
	},
	zoom: {
		get: function () {
			return this._zoom;
		},
		set: function (val) {
			this._zoom = val;
			this.emit('zoom-changed', this._zoom);
		}
	},

	// current playing position
	_position: {
		value: 0,
		writable: true
	},
	position: {
		get: function () {
			return this._position;
		},
		set: function (val) {
			this._position = val | 0;
			this.emit('position-changed', this._position);
		}
	},

	// current playing volume
	_volume: {
		value: 1,
		writable: true
	},
	volume: {
		get: function () {
			return this._volume;
		},
		set: function (val) {
			this._volume = val;
			this.emit('volume-changed', this._volume);
		}
	},

	// list of available tracks
	_tracks: {
		value: []
	},

	_play_cycle: {
		value: false,
		writable: true
	},
	playing: {
		get: function () {
			return this._play_cycle;
		}
	}
});

TimeLine.add = function (track) {
	this.insert(track);
};

TimeLine.remove = function (track) {
	if (typeof track === 'string') {
		// actually was track.id
		track = this.get(track);
	}

	var index = this._tracks.indexOf(track);

	if (index !== -1) {
		this._tracks.splice(index, 1);
		this.emit('track-removed', track);
	}
};

TimeLine.insert = function (track, position) {
	if (typeof track === 'string') {
		// actually was track.id
		track = this.get(track);
	}

	if (typeof position === 'undefined') {
		position = this._tracks.length - 1;
	}

	var index = this.index(track);

	if (index !== -1) {
		return;
	}

	this._tracks.splice(position, 0, track);
	this.emit('track-inserted', track, position);
};

TimeLine.move = function (track, position) {
	if (typeof track === 'string') {
		// actually was track.id
		track = this.get(track);
	}

	if (typeof position === 'undefined') {
		position = this._tracks.length - 1;
	}

	var index = this.index(track);

	if (index === -1) {
		return;
	}

	this._tracks.splice(position, 0, this._tracks.splice(index, 1)[0]);
	this.emit('track-moved', track, position, index);
};

TimeLine.get = function (track_id) {
	var track = null;

	this.tracks().some(function (t) {
		if (t.id === track_id) {
			track = t;

			return true;
		}
	});

	return track;
};

TimeLine.index = function (track) {
	return this._tracks.indexOf(track);
};

TimeLine.tracks = function () {
	return this._tracks.slice();
};

(function () {
	var timeout = null;

	function tracks_playable() {
		var position = TimeLine.position;

		return TimeLine.tracks().filter(function (t) {
			return t.offset + t.start <= position &&
				t.offset + t.end >= position;
		});
	}

	function tracks_available() {
		var position = TimeLine.position;

		return TimeLine.tracks().filter(function (t) {
			return t.offset + t.start > position;
		});
	}

	TimeLine.play = function () {
		if (this._play_cycle) {
			return;
		}

		// mark that it's now a play cycle time
		this._play_cycle = true;
		this.emit('play-state-changed');

		function play_cycle() {
			// add one second
			TimeLine.position += 1;

			var array = tracks_playable();

			if (!array.length && !tracks_available().length) {
				// no tracks are left to play
				TimeLine.pause();

				return;
			}

			var paused = array.filter(function (e) {
					return e.media.paused;
				}),
				playing = array.filter(function (e) {
					return !e.media.paused;
				});

			TimeLine.emit('play-cycle', playing.slice(), paused.slice());

			paused.forEach(function (e) {
				switch (e.type) {
					case 'audio':
					case 'video':
						// time to check for an effects
						e.media.currentTime = TimeLine.position - e.offset;
						e.media.play();
						break;
					case 'image':
						e.media.paused = false;
				}
			});

			timeout = setTimeout(play_cycle, 1000);
		}

		play_cycle();
	};

	TimeLine.pause = function () {
		if (!this._play_cycle) {
			return;
		}

		// remove play cycle mark
		this._play_cycle = false;
		this.emit('play-state-changed');

		// clear play cycle timeout
		clearTimeout(timeout);

		// pause all tracks (to be sure)
		var tracks = TimeLine.tracks();

		tracks.forEach(function (t) {
			switch (t.type) {
				case 'audio':
				case 'video':
					// pause
					t.media.pause();
					break;
				case 'image':
					t.media.paused = true;
					break;
			}
		});
	};

	function handle_position(t) {
		var position = TimeLine.position;

		if (t.offset + t.start > position ||
			t.offset + t.end < position) {
			return;
		}

		switch (t.type) {
			case 'audio':
			case 'video':
				// seek to match current position
				t.media.currentTime = position - t.offset;
				break;
		}
	}

	TimeLine.on('track-inserted', function (track) {
		track.on('load', function () {
			var handle = function () {
				handle_position(track);
			};

			// position changes
			track.on('offset-changed', handle);
			track.on('start-changed', handle);
			track.on('end-changed', handle);

			// auto-pause on end
			track.media.addEventListener('timeupdate', function (e) {
				var time = track.media.currentTime;

				if (time >= track.end) {
					track.media.pause();
				}
			})
		});
	});

	TimeLine.on('position-changed', function () {
		// no need for this while playing
		if (this._play_cycle) {
			return;
		}

		TimeLine.tracks().forEach(function (t) {
			handle_position(t);
		});
	});

	TimeLine.on('volume-changed', function () {
		var volume = TimeLine.volume;

		TimeLine.tracks().forEach(function (t) {
			switch (t.type) {
				case 'audio':
				case 'video':
					t.media.volume = volume;
					break;
			}
		});
	});
})();


