//% color=#ff7f00 icon="\uf1b9" block="PTKidsBIT (BLE-safe)"
//% groups='["Motor","Motion","Servo","ADC","Utils"]'
namespace PTKidsBIT {

    // ========= Pin Mapping (ปรับได้ตามบอร์ดจริง) =========
    // มอเตอร์ชุดซ้าย/ขวา: ขา direction = digital, ขา speed = PWM
    const DIR1 = DigitalPin.P13
    const PWM1 = AnalogPin.P14
    const DIR2 = DigitalPin.P15
    const PWM2 = AnalogPin.P16

    // ที่อยู่ ADC ภายนอก (เช่น ADS7828 / PCF8591 เป็นต้น) — ตัวอย่างตั้งไว้ 0x48
    const ADC_I2C_ADDR = 0x48

    // ========= Enums สำหรับบล็อก =========
    //% blockId=ptkb_motor_write_enum block="motor"
    export enum Motor_Write {
        //% block="Motor 1"
        Motor_1 = 1,
        //% block="Motor 2"
        Motor_2 = 2
    }

    //% blockId=ptkb_turn_enum block="direction"
    export enum _Turn {
        //% block="Left"
        Left = 0,
        //% block="Right"
        Right = 1
    }

    //% blockId=ptkb_spin_enum block="direction"
    export enum _Spin {
        //% block="Left"
        Left = 0,
        //% block="Right"
        Right = 1
    }

    //% blockId=ptkb_servo_enum block="servo pin"
    export enum Servo_Write {
        //% block="P8"
        P8 = 8,
        //% block="P12"
        P12 = 12
    }

    // ========= Utilities ภายใน =========
    function clamp100(v: number): number {
        if (v > 100) return 100
        if (v < -100) return -100
        return (v | 0)
    }

    function speedToDuty(speed: number): number {
        // speed -100..100 -> duty 0..1023
        const s = Math.abs(clamp100(speed))
        return Math.map(s, 0, 100, 0, 1023) | 0
    }

    function motor1(dirForward: boolean, speed: number) {
        pins.digitalWritePin(DIR1, dirForward ? 1 : 0)
        pins.analogWritePin(PWM1, speedToDuty(speed))
    }

    function motor2(dirForward: boolean, speed: number) {
        pins.digitalWritePin(DIR2, dirForward ? 1 : 0)
        pins.analogWritePin(PWM2, speedToDuty(speed))
    }

    // ========= Motor Controls =========

    /**
     * Drive a single motor (1 or 2). Speed -100..100 (sign = direction)
     */
    //% group="Motor"
    //% block="motorWrite %m speed %speed"
    //% speed.min=-100 speed.max=100 speed.defl=60
    //% weight=100
    export function motorWrite(m: Motor_Write, speed: number) {
        speed = clamp100(speed)
        if (m == Motor_Write.Motor_1) {
            motor1(speed >= 0, Math.abs(speed))
        } else {
            motor2(speed >= 0, Math.abs(speed))
        }
    }

    /**
     * Drive both motors at once. m1: -100..100 , m2: -100..100
     */
    //% group="Motor"
    //% block="motorGo m1 %m1 m2 %m2"
    //% m1.min=-100 m1.max=100 m1.defl=60
    //% m2.min=-100 m2.max=100 m2.defl=60
    //% weight=95
    export function motorGo(m1: number, m2: number) {
        m1 = clamp100(m1)
        m2 = clamp100(m2)
        motor1(m1 >= 0, Math.abs(m1))
        motor2(m2 >= 0, Math.abs(m2))
    }

    /**
     * Stop both motors (PWM=0)
     */
    //% group="Motor"
    //% block="motorStop"
    //% weight=90
    export function motorStop() {
        pins.analogWritePin(PWM1, 0)
        pins.analogWritePin(PWM2, 0)
    }

    // ========= Motion Helpers =========

    /**
     * Turn by stopping one side and running the other.
     */
    //% group="Motion"
    //% block="turn %dir speed %speed"
    //% speed.min=0 speed.max=100 speed.defl=60
    //% weight=80
    export function Turn(dir: _Turn, speed: number) {
        speed = Math.constrain(speed | 0, 0, 100)
        if (dir == _Turn.Left) {
            motor1(false, 0)
            motor2(true, speed)
        } else {
            motor1(true, speed)
            motor2(false, 0)
        }
    }

    /**
     * Spin in place (motors in opposite directions).
     */
    //% group="Motion"
    //% block="spin %dir speed %speed"
    //% speed.min=0 speed.max=100 speed.defl=60
    //% weight=75
    export function Spin(dir: _Spin, speed: number) {
        speed = Math.constrain(speed | 0, 0, 100)
        if (dir == _Spin.Left) {
            motor1(false, speed)
            motor2(true, speed)
        } else {
            motor1(true, speed)
            motor2(false, speed)
        }
    }

    // ========= Servo =========

    /**
     * Write servo (0..180) on pin P8 or P12.
     */
    //% group="Servo"
    //% block="servoWrite pin %p degree %deg"
    //% deg.min=0 deg.max=180 deg.defl=90
    //% weight=70
    export function servoWrite(p: Servo_Write, deg: number) {
        deg = Math.constrain(deg | 0, 0, 180)
        if (p == Servo_Write.P8) {
            pins.servoWritePin(AnalogPin.P8, deg)
        } else {
            pins.servoWritePin(AnalogPin.P12, deg)
        }
    }

    /**
     * Disable servo PWM on the selected pin (free the pin).
     */
    //% group="Servo"
    //% block="servoStop pin %p"
    //% weight=65
    export function servoStop(p: Servo_Write) {
        if (p == Servo_Write.P8) {
            pins.digitalWritePin(DigitalPin.P8, 0)
        } else {
            pins.digitalWritePin(DigitalPin.P12, 0)
        }
    }

    // ========= ADC (Optional via I²C) =========
    // หมายเหตุ: ถ้าบอร์ดไม่มี ADC ภายนอก ฟังก์ชันนี้จะคืน 0 ไว้ก่อน
    // หากใช้ ADS7828/PCF8591 ให้ปรับโค้ดตามดาต้าชีทได้

    /**
     * Read external ADC channel (0..7) over I²C (address 0x48 by default).
     * Returns 0..4095 if 12-bit ADC (adjust per chip), or 0 if not available.
     */
    //% group="ADC"
    //% block="ADCRead channel %ch"
    //% ch.min=0 ch.max=7 ch.defl=0
    //% weight=60
    export function ADCRead(ch: number): number {
        ch = Math.constrain(ch | 0, 0, 7)
        // --- ตัวอย่างเรียกอ่านสไตล์ทั่วไป (ต้องปรับตามชิปจริง) ---
        // สำหรับ ADS7828: control byte = 0x84 | (ch<<4) โดยประมาณ (ดูดาต้าชีท)
        // หมายเหตุ: โค้ดนี้เป็น placeholder ให้แก้ตามชิปที่บอร์ดใช้จริง
        try {
            let controlByte = (0x80 | 0x04 | ((ch & 0x07) << 4)) & 0xFF
            pins.i2cWriteNumber(ADC_I2C_ADDR, controlByte, NumberFormat.UInt8BE)
            // อ่าน 2 ไบต์ (12-bit -> ชิพอาจจัดรูปแบบต่างกัน)
            let raw = pins.i2cReadNumber(ADC_I2C_ADDR, NumberFormat.UInt16BE)
            return raw & 0x0FFF // ตัดให้เหลือ 12 บิต
        } catch (e) {
            // ถ้าไม่มีอุปกรณ์/อ่านไม่สำเร็จ ให้คืน 0
            return 0
        }
    }

    // ========= Utils =========

    /**
     * Quick brake both motors (sets PWM=0 immediately).
     */
    //% group="Utils"
    //% block="quickBrake"
    //% weight=50
    export function quickBrake() {
        pins.analogWritePin(PWM1, 0)
        pins.analogWritePin(PWM2, 0)
    }

    /**
     * Coast both motors (release DIR + PWM low)
     */
    //% group="Utils"
    //% block="coast"
    //% weight=45
    export function coast() {
        pins.digitalWritePin(DIR1, 0)
        pins.digitalWritePin(DIR2, 0)
        pins.analogWritePin(PWM1, 0)
        pins.analogWritePin(PWM2, 0)
    }
}
