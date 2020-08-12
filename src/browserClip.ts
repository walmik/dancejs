import { expandStr } from './utils';
const defaultSubdiv = '4n';
const defaultDur = '8n';

const random = (num = 1) => Math.round(Math.random() * num);

const getNote = (el: string, params: ClipParams, counter: number) => {
  return el === 'R' && params.randomNotes
    ? params.randomNotes[random(params.randomNotes.length - 1)]
    : params.notes[counter % params.notes.length];
};

const getDuration = (params: ClipParams, counter: number) => {
  return params.durations
    ? params.durations[counter % params.durations.length]
    : params.dur || params.subdiv || defaultDur;
};

/**
 * @param  {Object}
 * @return {Function}
 * Take an object literal which has a Tone.js instrument and return a function that can be used
 * as the callback in Tone.Sequence https://tonejs.github.io/docs/Sequence
 */
const getSeqFn = (params: ClipParams): SeqFn => {
  let counter = 0;
  if (params.instrument instanceof Tone.Player) {
    return (time: string, el: string) => {
      if (el === 'x' || el === 'R') {
        params.instrument.start(time);
        counter++;
      }
    };
  } else if (
    params.instrument instanceof Tone.PolySynth ||
    params.instrument instanceof Tone.Sampler
  ) {
    return (time: string, el: string) => {
      if (el === 'x' || el === 'R') {
        params.instrument.triggerAttackRelease(
          getNote(el, params, counter),
          getDuration(params, counter),
          time
        );
        counter++;
      }
    };
  } else if (params.instrument instanceof Tone.NoiseSynth) {
    return (time: string, el: string) => {
      if (el === 'x' || el === 'R') {
        params.instrument.triggerAttackRelease(
          getDuration(params, counter),
          time
        );
        counter++;
      }
    };
  } else {
    return (time: string, el: string) => {
      if (el === 'x' || el === 'R') {
        params.instrument.triggerAttackRelease(
          getNote(el, params, counter)[0],
          getDuration(params, counter),
          time
        );
        counter++;
      }
    };
  }
};

export const recursivelyApplyPatternToDurations = (
  patternArr: string[],
  length: number,
  durations: number[] = []
) => {
  patternArr.forEach(char => {
    if (typeof char === 'string') {
      if (char === 'x' || char === 'R') {
        durations.push(length);
      }
      if (char === '_' && durations.length) {
        durations[durations.length - 1] += length;
      }
    }
    if (Array.isArray(char)) {
      recursivelyApplyPatternToDurations(char, length / char.length, durations);
    }
  });
  return durations;
};

const generateSequence = (params: ClipParams, context?: any) => {
  context = context || Tone.getContext();

  if (!params.pattern) {
    throw new Error('No pattern provided!');
  }

  if (
    !params.player &&
    !params.instrument &&
    !params.sample &&
    !params.buffer &&
    !params.synth &&
    !params.sampler &&
    !params.samples
  ) {
    throw new Error('No player or instrument provided!');
  }

  if (!params.durations && !params.dur) {
    params.durations = recursivelyApplyPatternToDurations(
      expandStr(params.pattern),
      Tone.Ticks(params.subdiv || defaultSubdiv).toSeconds()
    );
  }

  /*
	1. The params object can be used to pass a sample (sound source) OR a synth(Synth/FMSynth/AMSynth etc) or samples.
	Scribbletune will then create a Tone.js Player or Tone.js Instrument or Tone.js Sampler respectively
	2. It can also be used to pass a Tone.js Player object or instrument that was created elsewhere
	(mostly by Scribbletune itself in the channel creation method)
	Either ways, a pattern is required and it will be used to create a playable Tone.js Sequence
	 */

  let effects = [];

  const createEffect = (eff: any) => {
    const effect: any =
      typeof eff === 'string' ? new Tone[eff]({ context }) : eff;
    return effect.toDestination();
  };

  const startEffect = (eff: any) => {
    return typeof eff.start === 'function' ? eff.start() : eff;
  };

  if (params.effects) {
    if (!Array.isArray(params.effects)) {
      params.effects = [params.effects];
    }
    effects = params.effects.map(createEffect).map(startEffect);
  }

  if (params.synth && !params.instrument) {
    params.instrument = params.synth;
    console.warn(
      'The "synth" parameter will be deprecated in the future. Please use the "instrument" parameter instead.'
    );
  }

  params.instrument =
    params.sample || params.buffer
      ? new Tone.Player({
          url: params.sample || params.buffer,
          context,
        })
      : params.sampler
      ? params.sampler
      : params.player
      ? params.player
      : params.samples
      ? new Tone.Sampler({ url: params.samples, context })
      : typeof params.instrument === 'string'
      ? new Tone[params.instrument]({ context })
      : params.instrument;

  if (params.volume) {
    params.instrument.volume.value = params.volume;
  }

  params.instrument.chain(...effects).toDestination();

  return new Tone.Sequence({
    callback: getSeqFn(params),
    events: expandStr(params.pattern),
    subdivision: params.subdiv || defaultSubdiv,
    context,
  });
};

export const totalPatternDuration = (
  pattern: any,
  subdivOrLength: string | number
) => {
  return typeof subdivOrLength === 'number'
    ? subdivOrLength * expandStr(pattern).length
    : Tone.Ticks(subdivOrLength).toSeconds() * expandStr(pattern).length;
};

let ongoingRenderingCounter = 0;
let originalContext: any;

const recreateToneObjectInContext = (toneObject: any, context: any) => {
  if (toneObject instanceof Tone.PolySynth) {
    return new Tone.PolySynth(Tone[toneObject._dummyVoice.name], {
      ...toneObject.get(),
      context,
    });
  } else {
    return new Tone[toneObject.name]({
      ...toneObject.get(),
      context,
    });
  }
};

const offlineRenderClip = (params: ClipParams, duration: number) => {
  if (!originalContext) {
    originalContext = Tone.getContext();
  }
  ongoingRenderingCounter++;
  const player = new Tone.Player({ context: originalContext, loop: true });
  Tone.Offline(({ transport }: any) => {
    if (params.instrument) {
      params.instrument =
        typeof params.instrument !== 'string'
          ? recreateToneObjectInContext(params.instrument, transport.context)
          : params.instrument;
    }
    if (params.effects) {
      if (!Array.isArray(params.effects)) {
        params.effects = [params.effects];
      }
      params.effects = params.effects.map((effect: any) => {
        return typeof effect !== 'string'
          ? recreateToneObjectInContext(effect, transport.context)
          : effect;
      });
    }
    const sequence = generateSequence(params, transport.context);
    sequence.start();
    transport.start(); // this is why offline rendering doesn't work with buffer-based instruments for now. We start transport before the buffer inside the recreated instrument is finished being computed.
  }, duration).then((buffer: any) => {
    player.buffer = buffer;
    ongoingRenderingCounter--;
    if (ongoingRenderingCounter === 0) {
      Tone.setContext(originalContext);
      params.offlineRenderingCallback?.();
    }
  });
  player.toDestination();
  player.sync();
  return player;
};

/**
 * @param  {Object}
 * @return {Tone.js Sequence Object}
 * Take a object literal that may have a Tone.js player OR instrument
 * or simply a sample or synth with a pattern and return a Tone.js sequence
 */
export const browserClip = (params: ClipParams) => {
  if (params.offlineRendering) {
    if (params.sample || params.samples || params.buffer || params.player) {
      console.warn(
        'Offline rendering is not available for `sample`, `samples`, `buffer` or `player` parameters (buffer-based instruments). Please use only `synth` or `instrument` parameters.'
      );
    } else {
      return offlineRenderClip(
        params,
        totalPatternDuration(params.pattern, params.subdiv || defaultSubdiv)
      );
    }
  }
  return generateSequence(params, originalContext);
};
