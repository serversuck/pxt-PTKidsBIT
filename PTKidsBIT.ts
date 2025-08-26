/**
 * PTKidsBIT (modded) — minimal, stable, servo-safe
 * - ปรับได้ที่ CONFIG ด้านล่าง ถ้าบอร์ดแมปขาไม่ตรง
 * - เซอร์โวใช้ 50Hz (20ms) + pulse 500–2500us
 * - แยก helper map สำหรับ S1/S2 และ Motor A/B
 */

namespace PTKidsBIT {
    // ======= CONFIG: ปรับตามบอร์ดของคุณ =======
    // Servo ports (S1/S2) -> AnalogPin
    const SERVO_S1: AnalogPin = AnalogPin.P8;   // เปลี่ยนถ้าบอร์ดคุณใช้ขาอื่น
    const SERVO_S2: AnalogPin = AnalogPin.P12;  // เปลี่ยนถ้าบอร์ดคุณใช้ขาอื่น

    // Motor driver (สองพินต่อมอเตอร์; ใช้ PWM ที่พิน *_PWM ถ้ามี)
    // โหมด AIN1/AIN2 แบบ H-bridge มาตรฐาน
    const M1_IN1: DigitalPin = DigitalPin.P13;
    const M1_IN2: DigitalPin = DigitalPin.P14;
    const M1_PWM: AnalogPin  = AnalogPin.P1;    // ถ้าไม่มีสาย PWM แยก ใช้ IN1/IN2 แบบ on/off

    const M2_IN1: DigitalPin = DigitalPin.P15;
    const M2_IN2: DigitalPin = DigitalPin.P16;
    const M2_PWM: AnalogPin  = AnalogPin.P2;

    // Ultrasonic default pins (Trig/Echo) — ปรับตามบอร์ด
    const US_TRIG: DigitalPin = DigitalPin.P0;
    const US_ECHO: DigitalPin = DigitalPin.P11;
    // ===========================================

    // ======= ENUMS (สำหรับบล็อก) =======
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

    // ปิดลำโพงออนบอร์ด (micro:bit V2) เพื่อไม่ให้ชน P0 เวลาใช้เสียง/servo
    // ให้ผู้ใช้เรียกใน on start ถ้าจำเป็น
    //% blockId=ptk_init block="PTKidsBIT init (disable speaker on V2)"
    export function init() {
        // try/catch กันคอมไพล์กับ V1
        // @ts-ignore
        if ((music as any)?.setBuiltInSpeakerEnabled) {
            // @ts-ignore
            music.setBuiltInSpeakerEnabled(false);
        }
    }

    // ======= SERVO (50Hz, 500–2500us) =======
    function servoPulseUs_(pin: AnalogPin, pulse: number) {
        pins.analogSetPeriod(pin, 20000); // 20ms = 50Hz
        const p = clamp(pulse, 500, 2500);
        const duty = p / 20000;          // 500..2500 over 20000
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
        if (port == ServoPort.S1) return SERVO_S1;
        return SERVO_S2;
    }

    //% blockId=ptk_servo_angle_port
    //% block="servo %port|angle %angle"
    //% angle.min=0 angle.max=180
    export function servoAngle(port: ServoPort, angle: number) {
        servoAnglePin(portToServoPin(port), angle);
    }

    // ======= MOTOR (H-bridge basic + PWM speed) =======
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

        // PWM (0..1023)
        const duty = Math.map(s, 0, 100, 0, 1023);
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
        // ความเร็วเสียง ≈ 340 m/s -> 29.1 us ต่อ cm (ไป-กลับ /2)
        const cm = d / 58; // มาตรฐาน MakeCode
        return cm > 0 ? cm : 0;
    }

    // ======= ADV: ปรับ mapping ผ่านบล็อก (ถ้าบอร์ดคุณขาไม่ตรง) =======
    // (ส่วนนี้ optional เผื่ออยากเปลี่ยนจาก UI)
    //% blockId=ptk_map_servo block="map servo S1 %s1|S2 %s2"
    export function mapServoPins(s1: AnalogPin, s2: AnalogPin) {
        // @ts-ignore
        (SERVO_S1 as any) = s1;
        // @ts-ignore
        (SERVO_S2 as any) = s2;
    }

    //% blockId=ptk_map_motor block="map motor %motor|IN1 %in1|IN2 %in2|PWM %pwm"
    export function mapMotorPins(motor: Motor, in1: DigitalPin, in2: DigitalPin, pwm: AnalogPin) {
        if (motor == Motor.M1) {
            // @ts-ignore
            (M1_IN1 as any) = in1;
            // @ts-ignore
            (M1_IN2 as any) = in2;
            // @ts-ignore
            (M1_PWM as any) = pwm;
        } else {
            // @ts-ignore
            (M2_IN1 as any) = in1;
            // @ts-ignore
            (M2_IN2 as any) = in2;
            // @ts-ignore
            (M2_PWM as any) = pwm;
        }
    }

    //% blockId=ptk_map_ultra block="map ultrasonic TRIG %trig|ECHO %echo"
    export function mapUltrasonicPins(trig: DigitalPin, echo: DigitalPin) {
        // @ts-ignore
        (US_TRIG as any) = trig;
        // @ts-ignore
        (US_ECHO as any) = echo;
    }
}
