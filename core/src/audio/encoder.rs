use ffmpeg_next::{codec, filter, format, frame, media};
use std::path::Path;

pub fn filter(
    spec: &str,
    decoder: &codec::decoder::Audio,
    encoder: &codec::encoder::Audio,
) -> Result<filter::Graph, ffmpeg_next::Error> {
    let mut filter = filter::Graph::new();

    let channel_layout = if !decoder.channel_layout().is_empty() {
        decoder.channel_layout()
    } else {
        ffmpeg_next::channel_layout::ChannelLayout::MONO
    };
    let args = format!(
        "time_base={}:sample_rate={}:sample_fmt={}:channel_layout=0x{:x}",
        decoder.time_base(),
        decoder.rate(),
        decoder.format().name(),
        channel_layout.bits()
    );

    filter.add(&filter::find("abuffer").unwrap(), "in", &args)?;
    filter.add(&filter::find("abuffersink").unwrap(), "out", "")?;

    {
        let mut out = filter.get("out").unwrap();

        out.set_sample_format(encoder.format());
        out.set_channel_layout(encoder.channel_layout());
        out.set_sample_rate(encoder.rate());
    }

    filter.output("in", 0)?.input("out", 0)?.parse(spec)?;
    filter.validate()?;

    println!("{}", filter.dump());

    if let Some(codec) = encoder.codec() {
        if !codec
            .capabilities()
            .contains(ffmpeg_next::codec::capabilities::Capabilities::VARIABLE_FRAME_SIZE)
        {
            filter.get("out").unwrap().sink().set_frame_size(encoder.frame_size());
        }
    }

    Ok(filter)
}

pub struct Transcoder {
    pub stream: usize,
    pub filter: filter::Graph,
    pub decoder: codec::decoder::Audio,
    pub encoder: codec::encoder::Audio,
    pub in_time_base: ffmpeg_next::Rational,
    pub out_time_base: ffmpeg_next::Rational,
}

pub fn transcoder<P: AsRef<Path>>(
    ictx: &mut format::context::Input,
    octx: &mut format::context::Output,
    path: &P,
    filter_spec: &str,
) -> Result<Transcoder, ffmpeg_next::Error> {
    let input = ictx
        .streams()
        .best(media::Type::Audio)
        .expect("could not find best audio stream");
    let context = ffmpeg_next::codec::context::Context::from_parameters(input.parameters())?;
    let mut decoder = context.decoder().audio()?;
    let codec = ffmpeg_next::encoder::find(octx.format().codec(path, media::Type::Audio))
        .expect("failed to find encoder")
        .audio()?;
    let global = octx
        .format()
        .flags()
        .contains(ffmpeg_next::format::flag::Flags::GLOBAL_HEADER);

    decoder.set_parameters(input.parameters())?;

    let mut output = octx.add_stream(codec)?;
    let context = ffmpeg_next::codec::context::Context::from_parameters(output.parameters())?;
    let mut encoder = context.encoder().audio()?;

    println!("decoder channel layout is {}", decoder.channel_layout().channels());
    if global {
        encoder.set_flags(ffmpeg_next::codec::flag::Flags::GLOBAL_HEADER);
    }

    encoder.set_rate(16000); // 16khz
    encoder.set_channel_layout(ffmpeg_next::channel_layout::ChannelLayout::MONO); // mono
    encoder.set_channels(1); // mono
    encoder.set_format(codec.formats().expect("unknown supported formats").next().unwrap());
    encoder.set_bit_rate(decoder.bit_rate());
    encoder.set_max_bit_rate(decoder.max_bit_rate());

    encoder.set_time_base((1, decoder.rate() as i32));
    output.set_time_base((1, decoder.rate() as i32));

    let encoder = encoder.open_as(codec)?;
    output.set_parameters(&encoder);

    let filter = filter(filter_spec, &decoder, &encoder)?;

    let in_time_base = decoder.time_base();
    let out_time_base = output.time_base();

    Ok(Transcoder {
        stream: input.index(),
        filter,
        decoder,
        encoder,
        in_time_base,
        out_time_base,
    })
}

impl Transcoder {
    pub fn send_frame_to_encoder(&mut self, frame: &ffmpeg_next::Frame) {
        self.encoder.send_frame(frame).unwrap();
    }

    pub fn send_eof_to_encoder(&mut self) {
        self.encoder.send_eof().unwrap();
    }

    pub fn receive_and_process_encoded_packets(&mut self, octx: &mut format::context::Output) {
        let mut encoded = ffmpeg_next::Packet::empty();
        while self.encoder.receive_packet(&mut encoded).is_ok() {
            encoded.set_stream(0);
            encoded.rescale_ts(self.in_time_base, self.out_time_base);
            encoded.write_interleaved(octx).unwrap();
        }
    }

    pub fn add_frame_to_filter(&mut self, frame: &ffmpeg_next::Frame) {
        self.filter.get("in").unwrap().source().add(frame).unwrap();
    }

    pub fn flush_filter(&mut self) {
        self.filter.get("in").unwrap().source().flush().unwrap();
    }

    pub fn get_and_process_filtered_frames(&mut self, octx: &mut format::context::Output) {
        let mut filtered = frame::Audio::empty();
        while self.filter.get("out").unwrap().sink().frame(&mut filtered).is_ok() {
            self.send_frame_to_encoder(&filtered);
            self.receive_and_process_encoded_packets(octx);
        }
    }

    pub fn send_packet_to_decoder(&mut self, packet: &ffmpeg_next::Packet) {
        self.decoder.send_packet(packet).unwrap();
    }

    pub fn send_eof_to_decoder(&mut self) {
        self.decoder.send_eof().unwrap();
    }

    pub fn receive_and_process_decoded_frames(&mut self, octx: &mut format::context::Output) {
        let mut decoded = frame::Audio::empty();
        while self.decoder.receive_frame(&mut decoded).is_ok() {
            let timestamp = decoded.timestamp();
            decoded.set_pts(timestamp);
            self.add_frame_to_filter(&decoded);
            self.get_and_process_filtered_frames(octx);
        }
    }
}
