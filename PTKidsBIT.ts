/**
 * PTKidsBIT (modded, clean v2)
 * - Servo 50Hz (20ms), pulse 500–2500us
 * - ปรับขา S1/S2, Motor, Ultrasonic ได้ทั้งในไฟล์หรือผ่านบล็อก map
 */

namespace PTKidsBIT {
    // ======= CONFIG (แก้ตรงนี้ถ้าบอร์ด map ขาไม่ตรง) =======
    // ใช้ let เพื่อให้ map…() เปลี่ยนค่าได้
    let SERVO_S1: AnalogPin = AnalogPin.P8;
    let SERVO_S2: AnalogPin = AnalogPin.P12;

    let M1_IN1: DigitalPin = DigitalPin.P13;
    let M1_IN2: DigitalPin = DigitalPin.P14;
    let M1_PWM: AnalogPin  = AnalogPin.P1;

    let M2_IN1: DigitalPin = DigitalPin.P15;
    let M2_IN2: DigitalPin = DigitalPin.P16;
    let M2_PWM: AnalogPin  = AnalogPin.P2;

    let US_TRIG: DigitalPin = DigitalPin.P0;
    let US_ECHO: DigitalPin = DigitalPin.P11;
    // ===============================================

    // ======= ENUMS =======
    export enum Motor {
        //% block="M1"
        M1 = 1,
        //% block="M2"
        M2 = 2
    }

    export enum Direction {
        //% block="forward"
        Forward = 0,
        //% block="backward"
        Backward = 1
    }

    export enum ServoPort {
        //% block="S1"
        S1 = 1,
        //% block="S2"
        S2 = 2
    }

    // ======= UTILS =======
    function clamp(v: number, lo: number, hi: number) {
        return Math.max(lo, Math.min(hi, v));
    }

    function map01(x: number, inMin: number, inMax: number, outMin: number, outMax: number) {
        const t = (x - inMin) / (inMax - inMin);
        return outMin + t * (outMax - outMin);
    }

    // (เลือกใช้เมื่อจำเป็น) ปิดลำโพงออนบอร์ด V2 ถ้าจะใช้ P0
    //% blockId=ptk_disable_speaker block="disable built-in speaker (V2)"
    export function disableBuiltInSpeaker() {
        // ใช้ index access เพื่อลด type error บน V1
        const anyMusic = music as any;
        if (anyMusic && typeof anyMusic["setBuiltInSpeakerEnabled"] === "function") {
            anyMusic["setBuiltInSpeakerEnabled"](false);
        }
    }

    // ======= SERVO (50Hz, 500–2500us) =======
    function servoPulseUs_(pin: AnalogPin, pulse: number) {
        pins.analogSetPeriod(pin, 20000); // 20ms = 50Hz
        const p = clamp(pulse, 500, 2500);
        const duty = p / 20000;          // 0..1
        pins.analogWritePin(pin, Math.round(duty * 1023));
    }

    //% blockId=ptk_servo_angle_pin
    //% block="servo pin %pin|angle %angle"
    //% angle.min=0 angle.max=180
    export function servoAnglePin(pin: AnalogPin, angle: number) {
        const a = clamp(angle, 0, 180);
        const pulse = 500 + (a / 180) * 2000;
        servoPulseUs_(pin, pulse);
    }

    function portToServoPin(port: ServoPort): AnalogPin {
        return (port == ServoPort.S1) ? SERVO_S1 : SERVO_S2;
    }

    //% blockId=ptk_servo_angle_port
    //% block="servo %port|angle %angle"
    //% angle.min=0 angle.max=180
    export function servoAngle(port: ServoPort, angle: number) {
        servoAnglePin(portToServoPin(port), angle);
    }

    // ======= MOTOR (H-bridge + PWM) =======
    function motorPins(m: Motor): { in1: DigitalPin, in2: DigitalPin, pwm: AnalogPin } {
        if (m == Motor.M1) return { in1: M1_IN1, in2: M1_IN2, pwm: M1_PWM };
        return { in1: M2_IN1, in2: M2_IN2, pwm: M2_PWM };
    }

    //% blockId=ptk_motor_run
    //% block="run %motor|%dir|speed %speed"
    //% speed.min=0 speed.max=100
    export function run(motor: Motor, dir: Direction, speed: number) {
        const pinsMap = motorPins(motor);
        const s = clamp(speed, 0, 100);

        // ทิศทาง
        pins.digitalWritePin(pinsMap.in1, dir == Direction.Forward ? 1 : 0);
        pins.digitalWritePin(pinsMap.in2, dir == Direction.Forward ? 0 : 1);

        // PWM 0..1023
        const duty = Math.round(map01(s, 0, 100, 0, 1023));
        pins.analogWritePin(pinsMap.pwm, duty);
    }

    //% blockId=ptk_motor_stop
    //% block="stop %motor"
    export function stop(motor: Motor) {
        const pinsMap = motorPins(motor);
        pins.digitalWritePin(pinsMap.in1, 0);
        pins.digitalWritePin(pinsMap.in2, 0);
        pins.analogWritePin(pinsMap.pwm, 0);
    }

    //% blockId=ptk_motor_brake
    //% block="brake %motor"
    export function brake(motor: Motor) {
        const pinsMap = motorPins(motor);
        // short brake
        pins.digitalWritePin(pinsMap.in1, 1);
        pins.digitalWritePin(pinsMap.in2, 1);
        pins.analogWritePin(pinsMap.pwm, 0);
    }

    // ======= ULTRASONIC (Trig/Echo แยกขา) =======
    //% blockId=ptk_ultra_read block="ultrasonic (cm)"
    export function ultrasonicCM(): number {
        pins.setPull(US_TRIG, PinPullMode.PullNone);
        pins.digitalWritePin(US_TRIG, 0);
        control.waitMicros(2);
        pins.digitalWritePin(US_TRIG, 1);
        control.waitMicros(10);
        pins.digitalWritePin(US_TRIG, 0);

        const d = pins.pulseIn(US_ECHO, PulseValue.High, 30000); // timeout ~30ms
        const cm = d / 58; // มาตรฐาน MakeCode
        return cm > 0 ? cm : 0;
    }

    // ======= MAP PINS (บล็อกสำหรับแก้ mapping จาก UI) =======
    //% blockId=ptk_map_servo block="map servo S1 %s1|S2 %s2"
    export function mapServoPins(s1: AnalogPin, s2: AnalogPin) {
        SERVO_S1 = s1;
        SERVO_S2 = s2;
    }

    //% blockId=ptk_map_motor block="map motor %motor|IN1 %in1|IN2 %in2|PWM %pwm"
    export function mapMotorPins(motor: Motor, in1: DigitalPin, in2: DigitalPin, pwm: AnalogPin) {
        if (motor == Motor.M1) {
            M1_IN1 = in1; M1_IN2 = in2; M1_PWM = pwm;
        } else {
            M2_IN1 = in1; M2_IN2 = in2; M2_PWM = pwm;
        }
    }

    //% blockId=ptk_map_ultra block="map ultrasonic TRIG %trig|ECHO %echo"
    export function mapUltrasonicPins(trig: DigitalPin, echo: DigitalPin) {
        US_TRIG = trig;
        US_ECHO = echo;
    }
}
